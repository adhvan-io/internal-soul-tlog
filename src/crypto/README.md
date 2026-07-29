# Crypto module (Phase 18-F / Stage 3)

Pure cryptographic primitives, ported byte-identical from
`scripts/sign-sth.js`. **Not wired into the production signing path.**
`scripts/sign-sth.js` continues to own every fetch, every archive write,
and all orchestration — this module only supplies deterministic,
side-effect-free functions that a *future* orchestration stage will call.

## What's here, and why

| File | From (scripts/sign-sth.js) | Why this boundary |
|---|---|---|
| `canonical.ts` | `canonicalPayload()` | The one function both signature checks depend on — kept alone because of how much rides on it, not because it's large. |
| `base64url.ts` | `fromB64url()` / `toB64url()` | A distinct, nameable encoding used by multiple other modules here (JWK key decoding, signature encoding) — kept separate so `did.ts`/`ed25519.ts` can depend on it without depending on each other. |
| `base58.ts` | `base58Decode()` | A different algorithm from base64url, with no multicodec/DID knowledge — pure base-N decoding only. |
| `did.ts` | the `publicKeyMultibase` branch of `extractAuthorityPublicKey()` | Multicodec/DID-key convention knowledge (the `'z'` prefix, the 2-byte Ed25519 multicodec) is a distinct concern from generic base58 decoding — `parseMultibaseKey()` is the function named in this stage's own API design guidance. |
| `keys.ts` | `loadPrivateKey()` + `rawBytesToPublicKey()` | **Merged**, not split into `spki.ts` (private) — both are the identical operation (wrap raw Ed25519 bytes in a fixed ASN.1 prefix for their key type) in each direction, and neither is substantial enough alone to justify its own file. |
| `ed25519.ts` | the inline `cryptoSign(null, ...)` / `cryptoVerify(null, ...)` calls in the main flow | These weren't separate functions in production — encapsulating the `algorithm: null` PureEdDSA convention behind named functions (`signPayload`, `verifySignature`) is new API surface, not new behavior: same primitive, same arguments, just named. |

## What's deliberately NOT here

`extractAuthorityPublicKey()` (deciding whether an `IdentityDocument` uses
`verificationMethod` or `verificationMethods`, indexing into the array,
and branching between the multibase and JWK encodings) **stays in
`scripts/sign-sth.js`** this stage. It's a protocol-resolution function —
it consumes a whole `IdentityDocument` shape and makes an array/union
choice — not a pure byte-in/byte-out cryptographic primitive. `did.ts`
supplies the one piece of that function's logic that *is* pure crypto
(`parseMultibaseKey`); the JWK branch needs nothing beyond
`decodeBase64url`, already in `base64url.ts`. The array/union resolution
itself is deferred to a later orchestration stage.

Also not here, per this stage's scope: `fetchJSON`/`postJSON` (HTTP),
`fatal()` (process control), `archivePathFor`/`updateArchive` (filesystem),
all environment-variable handling. None of these are cryptographic
primitives.

## Behavioral parity, not reinvention

Every function here is a direct, byte-identical port — same DER prefixes,
same base58 alphabet, same `algorithm: null` convention, same known quirk
in the base58 decoder (no leading-zero-byte preservation — safe today only
because the Ed25519 multicodec prefix byte is `0xed`, never `0x00`; see
`base58.ts`'s header comment). Nothing was "improved" in the course of
porting it. Every migrated function is compared byte-for-byte against the
live `scripts/sign-sth.js` implementation in its corresponding test file —
see each `*.test.ts` for the specific fixtures and assertions used.
