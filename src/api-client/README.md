# API client module (Phase 18-G / Stage 4)

A typed HTTP boundary for the SWALL API, ported byte-for-byte in behavior
from the original JavaScript implementation's `fetchJSON()`/`postJSON()`
and their three call sites. **As of Phase 18-J (Stage 7), this module is
part of the production signing path**, called by `src/witness/witness.ts`.
The original `scripts/sign-sth.js` is retained unmodified as the
regression/parity oracle this module was built and verified against; it
is no longer executed by `.github/workflows/witness.yml`.

## Responsibility

The API client transports and parses data. **It does not determine whether
a signed tree head is trustworthy.**

It does exactly three things:

1. `getLatestSTH()` — `GET {baseUrl}/swall/log/sth/latest`
2. `getIdentityDocument()` — `GET {baseUrl}/.well-known/swall.json`
3. `postWitnessSignature(request)` — `POST {baseUrl}/swall/log/sth/witness`

Every response is decoded and passed through the Stage 2 protocol
validators (`parseLatestSTHResponse`, `parseIdentityDocument`,
`parseWitnessPostResponse`) before being returned. Nothing is ever cast
(`as`) — `res.json()` is treated as `unknown` from the moment it's decoded
until a validator narrows it.

## Non-responsibilities

The client does **not**:

- verify the authority signature, or any signature
- import or hold private key material
- sign anything
- canonicalize a signed tree head
- decide which `VerificationMethod` (multibase vs. JWK) to use, or resolve
  raw key bytes from one — that's `extractAuthorityPublicKey()`'s job in
  `scripts/sign-sth.js` today (see `src/crypto/README.md` for exactly why
  that stays out of `src/crypto/` too, this stage)
- write archive files
- read environment variables — configuration is supplied by the caller
- decide what "already witnessed" *means* — `getLatestSTH()` returns
  whichever shape the server actually sent (fresh or already-witnessed);
  branching on that is an orchestration decision, not this client's

## Configuration

```ts
interface SwallApiClientConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch; // for tests only; defaults to the global fetch
}
```

Just one URL. `scripts/sign-sth.js` fetches `/swall/log/sth/latest`,
`/.well-known/swall.json`, and posts to `/swall/log/sth/witness` from the
exact same origin — there is no separate "authority URL" in the current
implementation, so this client doesn't invent one. `baseUrl`'s trailing
slash is stripped the same way `scripts/sign-sth.js` strips
`SWALL_API_BASE`'s.

## Trust boundary

```
HTTP response
    |
    v
status handling      (res.ok — 200-299 accepted, exactly matching today's implementation)
    |
    v
JSON decoding         (res.json(), typed `unknown`, never cast)
    |
    v
runtime protocol parser  (src/protocol/validate.ts)
    |
    v
typed protocol object
```

## Error behavior

Plain `Error` throughout — no custom error class. This matches
`scripts/sign-sth.js`'s own convention (it doesn't have one either), and
the four failure modes below are already distinguishable without one:

| Failure | How it surfaces | Message / type |
|---|---|---|
| Transport failure (nothing listening, DNS failure, etc.) | The rejection from `fetch()` itself propagates unmodified | Whatever the runtime's `fetch` throws (a `TypeError`, e.g. `fetch failed`) |
| Non-success HTTP status | Thrown here | `` `${url} → HTTP ${status}` `` for GET; `` `POST ${url} → HTTP ${status}: ${bodyText}` `` for the witness POST — identical format to `fetchJSON`/`postJSON` |
| Invalid JSON | `res.json()` throws natively | `SyntaxError`, unwrapped |
| Invalid protocol shape | The Stage 2 validator throws | `Error('Invalid ...')`, from `src/protocol/validate.ts` |

No response body text is captured on GET failures (matching
`fetchJSON()` exactly); the witness POST failure path does capture body
text (matching `postJSON()` exactly, including swallowing a failed
`res.text()` read and falling back to an empty string).

## HTTP status semantics (as implemented today, not idealized)

- Accepted statuses: `res.ok` (200–299), nothing narrower.
- A response body is always required to be valid JSON on a 2xx response —
  an empty or malformed body surfaces as an unwrapped `SyntaxError` from
  `res.json()`, not a friendly client-level message.
- "Already witnessed" / "already co-signed" is expressed **entirely in
  the JSON body**, on an ordinary 2xx status — never via a distinct HTTP
  status code (e.g. no `409 Conflict`) in either direction (`GET /latest`'s
  witnessed variant, or the witness POST's `alreadyCosigned` field). This
  isn't ambiguous in the current implementation; it's documented here so
  a future stage doesn't assume otherwise.

## Test strategy

Every server in `client.test.ts` is a loopback-only (`127.0.0.1`) HTTP
server, started per test and torn down afterward. No external network
access. Fixtures come from `test/fixtures/` (Stage 0) via the same
`.d.ts`-declaration pattern used since Stage 2 — none are duplicated.

## Intended later composition

```
API client
    |
    v
protocol objects
    |
    v
witness orchestration
    |
    v
crypto verification / signing
    |
    v
archive
```

This stage builds only the first box.
