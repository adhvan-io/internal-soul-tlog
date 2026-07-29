# Witness behavioral baseline (Phase 18-C / Stage 0)

Run with:

```
npm test
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
- **These fixtures exist to make a future TypeScript port measurable.** The
  point of pinning exact bytes now is so a later TypeScript reimplementation
  can be checked for byte-identical parity against the same fixtures, not
  just "looks right."
- **Production endpoints and archives are never used.** `GITHUB_WORKSPACE` is
  always redirected to a fresh temp directory in every test that writes an
  archive file; the real `sth/` tree in this repository is never touched.
- A few tests are deliberately named `DEFECT (documented, not fixed)` —
  these pin genuine gaps in the current implementation (e.g. no length
  validation on JWK-encoded authority keys, an uncaught exception on a
  missing STH timestamp) exactly as they behave today. They are not bugs in
  the tests; fixing the underlying behavior is out of scope for this stage.
