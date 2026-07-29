# Protocol module (Phase 18-E / Stage 2)

This module is the canonical specification of the SWALL wire protocol as
`scripts/sign-sth.js` implements it today. **It is not wired into the
production signing path.** JavaScript remains the only code that actually
fetches, verifies, signs, or archives anything.

## Trust boundary

```
External JSON  (fetch().json() — genuinely `unknown`, no guarantees)
      |
      v
Runtime validation  (validate.ts — hand-written type guards, JSON shape only)
      |
      v
Typed protocol objects  (types.ts — SignedTreeHead, IdentityDocument, ...)
      |
      v
Cryptographic verification  (still the JavaScript implementation's job)
      |
      v
Trusted domain objects
```

**TypeScript types alone never validate network input.** A type annotation
is a compile-time claim about a value's shape; it has zero effect at
runtime. `fetch(url).then(r => r.json())` returns `any` (widened to
`unknown` if you're careful) regardless of what type you annotate it with —
nothing checks that the bytes that came back over the wire actually match
that shape. The validators in `validate.ts` are the only thing in this
module that does real work at runtime: they inspect an `unknown` value
field-by-field and either narrow it into a typed protocol object or reject
it. Skipping them and just casting (`value as SignedTreeHead`) would give
you the type-checker's blessing over data nobody actually looked at.

## Validation philosophy

The validators check **JSON shape only** — the same scope
`scripts/sign-sth.js`'s own existing checks cover today: field presence,
primitive types, which union variant (multibase vs. JWK). They deliberately
do **not** validate:

- Ed25519 key contents (byte length, curve correctness)
- base58 correctness (leading-zero handling, alphabet)
- signatures (authority or witness)
- canonicalization

Those stay runtime responsibilities of the JavaScript implementation until
a later stage migrates them. Two tests in `validate.test.ts`
(`boundary: shape-valid ... still passes shape validation`) exist
specifically to make this boundary visible and enforced: a verification
method with a cryptographically too-short key still passes shape
validation here, because rejecting it is `extractAuthorityPublicKey()`'s
job, not this module's.

## Why some types don't have a validator

`WitnessPostRequest` is constructed by this repository, not received as
untrusted input — there's nothing to validate against an external source.
`WitnessConfig` is derived from environment variables (a trust boundary of
its own, but not a JSON-over-the-wire one), not from a network response.
Both are still modeled as types because they're genuine parts of the
protocol/domain, just not ones this stage's validators need to cover.

## Why `LatestSTHResponse` is a type alias, not a new interface

`GET /swall/log/sth/latest` returns exactly the same shape as an archive
record — the API includes the witness fields inline once a co-signature
exists. Defining a second, independently-maintained type for an identical
shape would just be two names for one fact, with a real risk of the two
definitions drifting apart later. `LatestSTHResponse` is `WitnessRecord`.
