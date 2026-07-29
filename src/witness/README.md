# Witness orchestration module (Phase 18-I / Stage 6)

The complete TypeScript witness flow, composing `protocol/`, `crypto/`,
`api-client/`, and `archive/`. **As of Phase 18-J (Stage 7), this is the
production implementation.** `.github/workflows/witness.yml` runs
`dist/cli/sign-sth.js` (compiled from `src/cli/sign-sth.ts`, which calls
`runWitness()` here). The original `scripts/sign-sth.js` is retained
unmodified as the regression/parity oracle this module was built and
verified against across every migration stage; it is no longer executed
by the workflow.

**The witness orchestrator is the policy and composition layer.** It
decides when an STH is eligible to receive a witness signature by:

1. validating transport shapes (via the protocol module's validators, at
   the API client boundary),
2. resolving authority key material (`identity.ts`),
3. verifying the authority signature (`crypto/`, before anything else happens),
4. signing only after successful verification,
5. persisting the authorized result (`archive/`).

## Dependency composition

```
witness
 ├── protocol   (types + runtime validators)
 ├── crypto     (canonicalization, keys, sign/verify)
 ├── api-client (HTTP transport + response parsing)
 └── archive    (filesystem persistence)
```

None of those four modules import anything from `witness/` or `cli/` —
verified by import audit, not assumed.

## Configuration boundary

`loadWitnessConfig(env: NodeJS.ProcessEnv): WitnessConfig` is the only
place in this module that reads `process.env`. `api-client`, `crypto`, and
`archive` never read environment variables themselves — every one of them
takes configuration as an explicit parameter (`baseUrl`, `repoRoot`, ...),
matching the precedent `api-client/` established in Stage 4.

`WitnessConfig` mirrors the two `fatal()`-validated required variables
(`SWALL_API_BASE`, `WITNESS_PRIVATE_KEY`, checked in that exact order) plus
the optional `WITNESS_KEY_ID`. `witnessKeyId` is resolved **once, during
config loading**, not at the point of use during signing (see
`deriveWitnessKeyId()`) — it depends only on `swallApiBase` and the
`WITNESS_KEY_ID` env var, neither of which changes between config-loading
time and sign time, so precomputing it changes nothing observable.

**One deliberate, documented translation:** `scripts/sign-sth.js` falls
back to `path.resolve(__dirname, '..')` when `GITHUB_WORKSPACE` is unset —
a location relative to *that specific file*. A TypeScript CLI compiled to
a different location has no faithful equivalent. This fallback path never
actually executes in production (GitHub Actions always sets
`GITHUB_WORKSPACE`), so `loadWitnessConfig` uses `process.cwd()` instead,
which matches the real local-dev invocation pattern (running the script
from the repo root) in every scenario that occurs in practice.

## Trust decision sequence

Preserved exactly from `scripts/sign-sth.js`'s main flow:

1. Fetch latest STH.
2. *(Required-field validation happens inside the fetch, at the protocol
   boundary — see "Documented divergences" below.)*
3. Exit early if already witnessed — **no identity fetch, no signing, no
   POST occurs on this path.**
4. Fetch identity document.
5. Resolve the authority public key (`identity.ts`).
6. Canonicalize the STH.
7. **Verify the authority signature.**
8. Fail closed if invalid — no witness signature is computed past this point.
9. Import the witness private key and sign.
10. Read the pre-resolved `witnessKeyId`.
11. POST the co-signature.
12. Handle an already-cosigned race response.
13. Update the local archive.
14. Return a `WitnessOutcome`.

## Fail-closed guarantee

An invalid authority signature throws before any of: witness key import,
witness signing, the POST request, or the archive update. Verified
directly: `witness.test.ts`'s invalid-signature test asserts zero POST
calls occurred and the archive file is byte-identical to its pre-run
state.

## Idempotency paths (kept distinct, never conflated)

- **Latest-response already witnessed**: `GET /swall/log/sth/latest`
  itself returns the witnessed shape. No identity fetch, no signing, no
  POST — only an archive catch-up write using the API's own returned
  `witnessSignature`/`witnessKeyId`/`witnessedAt`.
- **POST race / already-cosigned**: the local flow proceeds through
  signing and POSTs normally; the *response* says another process won the
  race. The archive is still updated, using the **locally computed**
  signature (not a server-provided one) — exactly matching
  `scripts/sign-sth.js`, which never re-derives anything from the race
  response before archiving.

## Error behavior

`runWitness()` throws ordinary `Error` (no custom class) with messages
matching `fatal()`'s un-prefixed argument exactly, for every failure mode
that has a faithful equivalent. The `[witness] FATAL:` prefix and
`process.exit(1)` are added only by the CLI adapter (`src/cli/sign-sth.ts`),
mirroring `fatal()`'s own console output byte-for-byte — verified directly
via child-process tests (`src/cli/sign-sth.test.ts`), not assumed.

Console `log`/`warn` output for *successful* and *idempotent* steps
(authority-verified, co-signed, already-co-signed, archive warnings) stays
inside `runWitness()`/`updateArchive()` itself, not deferred to the CLI —
these are real-time progress narration, not error handling, and moving
them to the CLI would make it impossible to interleave them correctly with
the rest of the flow (the same precedent `archive/`'s `updateArchive()`
already established in Stage 5).

## Documented divergences from JavaScript — cutover decisions (Phase 18-J)

Three divergences were found and investigated during Stage 6. Before
cutover, Stage 7 formally reviewed each individually and decided to
**intentionally accept** all three, unchanged. None were altered to force
artificial byte-identical parity — doing so would mean either weakening
`api-client/`'s "every response is validated" guarantee (Stage 4) or
coupling `protocol/`'s validator messages to one specific historical
caller's wording (neither is right). All three still converge on the same
**fail-closed** outcome except #3.

1. **Missing `sth`/`signature` in the `/latest` response.** JS: a
   dedicated check after a successful fetch throws `"Malformed STH
   response: missing sth or signature"`. TS: Stage 2's protocol parser
   inside `getLatestSTH()` rejects it *during* the fetch, so `runWitness`
   wraps it as `"Failed to fetch STH: Invalid latest STH response: ..."`.
   Different message text, same fail-closed exit-1 outcome.
   **Decision: intentionally accepted.** This scenario has never occurred
   in the archive's real history (393 committed STH records, all
   well-formed); the operationally relevant property — fail closed before
   any signing — is identical either way. See `witness.test.ts`'s
   `DOCUMENTED DIVERGENCE` tests.
2. **Missing/empty `verificationMethod`, or an unsupported shape, in the
   identity document.** Same pattern: JS fails inside
   `extractAuthorityPublicKey()` (`"Cannot parse authority public key:
   ..."`); TS fails earlier, inside `getIdentityDocument()`, wrapped as
   `"Failed to fetch authority identity: Invalid identity document:
   ..."`. Different message, same outcome. **Decision: intentionally
   accepted**, same reasoning as #1. (A verification method with a
   *cryptographically* malformed but shape-valid key — e.g. a too-short
   multibase or JWK value — is **not** affected: Stage 2 deliberately
   doesn't validate key correctness, so those cases reach
   `resolveAuthorityPublicKey()`/`crypto/` exactly as in JS, with
   byte-identical messages.)
3. **Malformed witness POST response (wrong primitive type, e.g.
   `alreadyCosigned` as a string).** This is the one case where the
   *outcome*, not just the message, differs: JS's fully permissive
   `result.alreadyCosigned` property access treats a truthy string as
   "race occurred" and proceeds to update the archive normally (exit 0).
   TS's `postWitnessSignature()` (Stage 4) rejects the malformed shape
   outright (`runWitness` throws `"Failed to submit co-signature: ..."`,
   exit 1 at the CLI). **Decision: intentionally accepted, TS's stricter
   behavior preserved as-is** — not adjusted to match JS. JS's behavior
   here is the more concerning one for a transparency-log witness: silently
   proceeding as if a co-signature was successfully recorded when the
   server's response can't actually be trusted to mean that is a real gap,
   not a feature worth replicating. TS failing loudly (exit 1, visible CI
   failure) on a nonsensical server response is more consistent with this
   project's own repeatedly-stated fail-closed philosophy than forcing
   parity with JS's permissiveness would be. This scenario has also never
   occurred in the archive's history. If the SWALL API is ever found to
   legitimately send responses this shape in production, that would be
   grounds to revisit — no such case is known. See the
   `DOCUMENTED DIVERGENCE` test in `witness.test.ts` that runs both
   implementations side by side against the identical malformed fixture
   and shows the different outcomes explicitly.

## Known defects preserved (not fixed) in this composition

All inherited unchanged from earlier stages, each pinned by a specific test:

- base58 leading-zero-byte handling (`src/crypto/base58.test.ts`, carried
  through unchanged since `did.ts`/`identity.ts` call the same decoder)
- no `kty`/`crv`/length validation on JWK-encoded authority keys
  (`identity.test.ts`'s `DEFECT` test)
- `archivePathFor`'s timestamp-without-`T` and non-numeric-`treeSize`
  quirks (inherited from `archive/`, exercised end-to-end by
  `witness.test.ts`'s archive-edge-case tests)
- a malformed archive file's `JSON.parse` failure still propagates
  uncaught through the whole flow (`witness.test.ts`'s malformed-archive-JSON test)

## CLI boundary

`src/cli/sign-sth.ts` compiles to a directly runnable `dist/cli/sign-sth.js`,
guarded by the same `require.main === module` pattern
`scripts/sign-sth.js` uses, for the same reason: importing it for its
(non-existent, in this case — it exports nothing) surface must never
trigger config loading or `process.exit`. As of Phase 18-J (Stage 7), this
is the exact command `.github/workflows/witness.yml` runs in production.

## Test strategy

Every server in `witness.test.ts`/`sign-sth.test.ts` is loopback-only
(`127.0.0.1`); every archive root is a fresh `fs.mkdtempSync` temp
directory; every key is synthetic. Cross-implementation parity tests spawn
the real `scripts/sign-sth.js` as a child process (`test/helpers/run-witness.js`,
from Stage 0) against the same mock server and compare actual observed
output — not a reimplementation compared against itself.
