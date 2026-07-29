# Witness behavioral baseline (Phase 18-C / Stage 0)

`npm test` builds and runs this suite together with every other layer
(protocol/crypto/api-client/archive/witness/cli). To run just this
JavaScript baseline suite on its own:

```
node --test test/*.test.js
```

(uses Node's built-in `node --test` — no test framework dependency)

- **Offline only.** No test ever contacts a real network host. Orchestration
  and child-process tests spin up a loopback-only (`127.0.0.1`) mock HTTP
  server for the duration of a single test and tear it down afterward.
- **All keys are synthetic.** Every private/public key under `test/fixtures/`
  was generated once, offline, purely for this suite. None of it is derived
  from or usable against any real SWALL authority or witness key. See the
  header comment in `test/fixtures/synthetic.js`.
- **Canonicalization and signature outputs are intentionally frozen.**
  Ed25519 signing has no random nonce, so a fixed key + fixed payload always
  produces the same signature bytes. The expected canonical payload and
  signature values in `test/fixtures/synthetic.js` are committed literals,
  not recomputed at test time — that's what makes them a real oracle instead
  of the code testing itself.
- **These fixtures made the TypeScript migration (Phases 18-D through 18-J)
  measurable**, and continue to serve as the frozen, byte-exact regression
  oracle now that TypeScript (`src/witness/` + `src/cli/`) is the
  production implementation — see `src/witness/README.md`. The original
  JavaScript implementation this suite exercises (`scripts/sign-sth.js`)
  is retained specifically so these fixtures keep having a live oracle to
  compare against, not just a static expected value.
- **Production endpoints and archives are never used.** `GITHUB_WORKSPACE` is
  always redirected to a fresh temp directory in every test that writes an
  archive file; the real `sth/` tree in this repository is never touched.
- A few tests are deliberately named `DEFECT (documented, not fixed)` —
  these pin genuine gaps in the current implementation (e.g. no length
  validation on JWK-encoded authority keys, an uncaught exception on a
  missing STH timestamp) exactly as they behave today. They are not bugs in
  the tests; fixing the underlying behavior is out of scope for this stage.
