# Witness configuration

Same configuration vocabulary as internal-soul's `platform/config/`, at the
scale this repository actually needs (4 env vars, 1 secret).

## What exists

```
config/
  README.md
  schema/            structural validation rules (hand-written, JSON-Schema-shaped)
  defaults/base.json checked-in defaults
  environments/*.json one profile per environment
  mappings/          environment-variables.json (the only accepted-var registry) + secret-bindings.json
  examples/          template for local/secrets.json
  local/secrets.json gitignored; real local development secret
  tsconfig.json      own TS project (rootDir: config/src, outDir: config/dist) -- see "Why a separate tsconfig" below
  src/               the loader itself + co-located tests
```

## Supported environments

`development`, `test`, `staging`, `production`, selected by `SWALL_ENV`
(required, never inferred). Unlike internal-soul, environment mostly governs
the secret provider here — there isn't a CORS/emulator/trust-bypass surface
in a witness co-signer.

## Load precedence

```
defaults/base.json
  -> exactly one environments/<SWALL_ENV>.json
  -> approved environment-variable overrides
  -> secret-reference resolution
  -> structural validation
  -> environment-invariant validation
  -> deep freeze
```

Entry point: `src/index.ts`'s `loadTlogConfig(options)`. It returns
`{ environment, witnessEnv }` — a resolved, validated env-like object, **not**
the final `WitnessConfig`. The caller passes `witnessEnv` into
`src/witness/config.ts`'s existing `loadWitnessConfig()` to get that (see
`src/cli/sign-sth.ts`). This split exists because config/'s own TypeScript
project cannot import across into the main `src/` tree (see below) — and
because it keeps `loadWitnessConfig()` as the single, unchanged authority for
the actual `swallApiBase`/`witnessKeyId`/`repoRoot` derivation, matching its
"byte-identical port of `scripts/sign-sth.js`" invariant exactly.

## Why a separate tsconfig

The root `tsconfig.json` has `rootDir: "src"`; a file under `config/src`
importing something under the top-level `src/` would violate TypeScript's
rootDir enforcement (every compiled file must live under rootDir). Rather
than restructure the whole repository's output layout to accommodate a
shared root, `config/` gets its own small TypeScript project, built
separately (`npm run build:config`, wired into `npm run build`/`typecheck`/
`test` before the main compile). It has no dependency in the other
direction, so `config/` always builds first.

## Which files are checked in vs. gitignored

Checked in: everything under `schema/`, `defaults/`, `environments/`,
`mappings/`, `examples/`. Gitignored: `local/secrets.json` (development's
real witness key) and `config/dist/` (build output, matches the root
`.gitignore`'s `dist/` pattern already).

## Which values are secrets

Just one: `witnessPrivateKey` (`WITNESS_PRIVATE_KEY`). Arrives as a GitHub
Actions Secret bound directly to the workflow's `env:` block in
staging/production (deployment topology, unchanged) — there's no separate
SDK call to make for this repo, unlike internal-soul's Secret Manager
integration, so the "provider" for staging/production is just a named,
registered `process.env` read rather than an ambient one.

## Accepted environment variables

`mappings/environment-variables.json` is authoritative. `SWALL_ENV`
(required, new), `SWALL_API_BASE` (required, no default anywhere —
unchanged), `WITNESS_KEY_ID` (optional override), `GITHUB_WORKSPACE`
(GitHub Actions-injected, not operator-set).

## Required production fields

`SWALL_ENV=production`, `SWALL_API_BASE`, `WITNESS_PRIVATE_KEY` (via the
GitHub Actions Secret binding).

## Safe local setup

```
cp config/examples/secrets.local.example.json config/local/secrets.json
# edit config/local/secrets.json with a synthetic key
SWALL_ENV=development SWALL_API_BASE=http://localhost:8081 node dist/cli/sign-sth.js
```

## How to validate config without running the signer

```js
const { loadTlogConfig } = require('./config/dist/index.js');
loadTlogConfig({ env: process.env }); // throws with a combined error list if invalid
```

## `scripts/sign-sth.js` — not migrated, and why

`scripts/sign-sth.js` remains the actual production entrypoint wired into
`.github/workflows/witness.yml`; it is retained as a documented legacy
parity/regression oracle per Phase 6 Section 15, not migrated onto this
loader. Its 4 direct `process.env` reads are unchanged. `src/cli/sign-sth.ts`
(compiles to `dist/cli/sign-sth.js`, not yet wired into the production
workflow) is what actually uses `loadTlogConfig()` — see
`test/config-integration.test.js` for proof the composition works
end-to-end. Retiring `scripts/sign-sth.js` is not yet justified: its parity
tests (`test/witness.childprocess.test.js` and friends) still provide
independent coverage the TS path alone doesn't duplicate.
