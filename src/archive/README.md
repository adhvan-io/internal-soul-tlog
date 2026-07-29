# Archive module (Phase 18-H / Stage 5)

Persists an already-authorized witness result to
`sth/{YYYY-MM-DD}/{treeSize}.json`, ported byte-for-byte from the original
JavaScript implementation's `archivePathFor()` and `updateArchive()`. **As
of Phase 18-J (Stage 7), this module is part of the production signing
path**, called by `src/witness/witness.ts`. The original
`scripts/sign-sth.js` is retained unmodified as the regression/parity
oracle this module was built and verified against; it is no longer
executed by `.github/workflows/witness.yml`.

## Responsibility

**The archive module persists an already-authorized witness result. It
does not:**

- verify signatures
- contact SWALL (no network access at all)
- perform Git operations
- determine trust

By the time anything calls `updateArchive()`, the witness signature has
already been computed and (in production) already POSTed to the API. This
module's only job is writing that result to the correct file, correctly,
idempotently — nothing about *whether* it should be written.

## Path derivation (pure)

`archivePathFor(sth, repoRoot)` has no I/O and no dependency on
`archive.ts`'s filesystem code — kept in its own file (`path.ts`) so the
timestamp → path calculation can be reasoned about and tested in complete
isolation from serialization or file access.

Two known quirks are preserved exactly, not fixed (Stage 0 remains
authoritative):

- a timestamp with no `T` separator silently becomes the whole string used
  as the date folder name (no error, just a wrong-looking path);
- `treeSize` is interpolated into the filename with no validation.

A timestamp that's missing/non-string at runtime (despite the
`SignedTreeHead` type saying `timestamp: string`) still throws exactly the
way calling `.split()` on a non-string does in JavaScript — the type
documents the contract; it doesn't change what a real violation does.

## Serialization contract (byte-identical)

- Two-space indentation (`JSON.stringify(record, null, 2)`)
- A trailing newline appended after the JSON text
- Field order: whatever the original file's key order was
  (`sth`, `signature` in every real archive record), then
  `witnessSignature`, `witnessKeyId`, `witnessedAt` appended in that exact
  order (JS object property insertion order, preserved by `JSON.stringify`)
- UTF-8, no BOM (`fs.writeFileSync` with a plain string writes UTF-8
  without a BOM)

Tests compare output via `Buffer.equals`/`Buffer.compare`, not parsed
object equality — parsed-object comparison can't catch a key-order or
whitespace regression, and both matter here since the archive is a
git-committed, publicly diffable audit trail.

## Idempotency (two independent layers)

This module implements only the **file-level** check: if the archive file
on disk already has a `witnessSignature`, it's left untouched. This is
deliberately separate from the **API-response-level** already-cosigned
check in `scripts/sign-sth.js`'s main flow (whether `GET
/swall/log/sth/latest` already returned a `witnessSignature`) — the two
checks catch different race windows and neither replaces the other. Both
stay exactly as split apart as they are in production; this stage doesn't
merge them.

The archive file itself is read with **no protocol validation** — exactly
like production, which only ever reads one optional field
(`record.witnessSignature`) off the parsed JSON before mutating and
rewriting it. Passing it through the Stage 2 protocol parsers here would
reject archive files production happily accepts; that would be a
behavior change, not a port.

## Missing-file behavior

If the archive file doesn't exist yet (the SWALL API may not have
committed it), `updateArchive()` warns twice (matching production's exact
two `console.warn` messages) and returns without creating a file, without
throwing, and without any other side effect.

## Error behavior

Plain values and plain `Error` only — no custom exception type, no
Result/Either wrapper, no storage abstraction. A malformed archive file
(exists, but isn't valid JSON) is **not** caught here: `JSON.parse`'s
`SyntaxError` propagates uncaught, exactly matching
`scripts/sign-sth.js`'s current (unhandled) behavior — verified directly
against the live JS implementation, not assumed.

## What's new here, and why it's still parity-preserving

`updateArchive()` returns an `ArchiveUpdateOutcome`
(`'archive-missing' | 'already-witnessed' | 'updated'`) instead of nothing.
The JS version returns `undefined` on every path; this addition changes
nothing about what gets written to disk or logged to the console — it
exists so tests (and future callers) can observe what happened without
capturing `console.warn`/`console.log` output. `repoRoot` is a required
parameter here, with no environment-variable-reading default — the JS
version's `process.env.GITHUB_WORKSPACE` fallback is a configuration
concern that belongs to whatever supplies this module's caller, not to
the module itself (the same principle `src/api-client/` already
established: configuration is supplied by the caller).

## Test strategy

All filesystem tests use a fresh `fs.mkdtempSync` temp directory per test,
torn down afterward. The real repository's `sth/` tree is never touched.
