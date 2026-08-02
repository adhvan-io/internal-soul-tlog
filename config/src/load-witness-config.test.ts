import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTlogConfig } from './load-witness-config.js';
import { validateEnvironmentInvariants } from './validate-environment-invariants.js';

const VALID_SECRET = { witnessPrivateKey: 'fixture-witness-key' };

test('missing SWALL_ENV fails closed', () => {
  assert.throws(() => loadTlogConfig({ env: {} }), /SWALL_ENV must be one of/);
});

test('a test harness supplying SWALL_ENV explicitly succeeds', () => {
  assert.doesNotThrow(() =>
    loadTlogConfig({ env: { SWALL_ENV: 'test', SWALL_API_BASE: 'https://swall.example' }, secretsFixture: VALID_SECRET })
  );
});

test('unregistered environment variables do not alter the resolved config fields', () => {
  // witnessEnv deliberately preserves the full input env by spreading it
  // (so any variable loadWitnessConfig() might read stays visible) -- this
  // proves the four REGISTERED fields it resolves are identical regardless
  // of an unrelated ambient variable, not that the object is byte-identical.
  const a = loadTlogConfig({
    env: { SWALL_ENV: 'test', SWALL_API_BASE: 'https://swall.example', SWALL_TOTALLY_MADE_UP: 'x' },
    secretsFixture: VALID_SECRET,
  });
  const b = loadTlogConfig({
    env: { SWALL_ENV: 'test', SWALL_API_BASE: 'https://swall.example' },
    secretsFixture: VALID_SECRET,
  });
  const REGISTERED_FIELDS = ['SWALL_API_BASE', 'WITNESS_PRIVATE_KEY', 'WITNESS_KEY_ID', 'GITHUB_WORKSPACE'] as const;
  for (const field of REGISTERED_FIELDS) {
    assert.equal(a.witnessEnv[field], b.witnessEnv[field]);
  }
});

test('WITNESS_KEY_ID override passes through into the resolved witnessEnv', () => {
  const config = loadTlogConfig({
    env: { SWALL_ENV: 'test', SWALL_API_BASE: 'https://swall.example', WITNESS_KEY_ID: 'did:web:explicit#key-1' },
    secretsFixture: VALID_SECRET,
  });
  assert.equal(config.witnessEnv.WITNESS_KEY_ID, 'did:web:explicit#key-1');
});

test('the resolved secret is placed into witnessEnv.WITNESS_PRIVATE_KEY', () => {
  const config = loadTlogConfig({
    env: { SWALL_ENV: 'test', SWALL_API_BASE: 'https://swall.example' },
    secretsFixture: VALID_SECRET,
  });
  assert.equal(config.witnessEnv.WITNESS_PRIVATE_KEY, VALID_SECRET.witnessPrivateKey);
});

// ── Environment invariants ──────────────────────────────────────────────

test('development accepts the local-file secret provider without loadTlogConfig itself enforcing the secret', () => {
  // No local secrets.json exists in this checkout. The config-loader's own
  // validation is lenient outside production-like mode (enforceRequired
  // false), so loadTlogConfig() does not throw here -- it leaves
  // witnessEnv.WITNESS_PRIVATE_KEY unresolved. The caller composing this
  // with the real loadWitnessConfig() (src/cli/sign-sth.ts; see
  // test/config-integration.test.js) is where that absence surfaces as a
  // hard failure, unconditionally, unchanged.
  const config = loadTlogConfig({ env: { SWALL_ENV: 'development', SWALL_API_BASE: 'https://swall.example' } });
  assert.equal(config.witnessEnv.WITNESS_PRIVATE_KEY, undefined);
});

test('staging/production require the github-actions-secret provider (invariant-level check)', () => {
  const errors = validateEnvironmentInvariants({
    environment: 'staging',
    swallApiBase: 'https://swall.example',
    secretProvider: { type: 'local-file' },
  });
  assert.ok(errors.some((e) => e.includes("must be 'github-actions-secret'")));
});

test('development/test reject the github-actions-secret provider (invariant-level check)', () => {
  const errors = validateEnvironmentInvariants({
    environment: 'development',
    swallApiBase: 'https://swall.example',
    secretProvider: { type: 'github-actions-secret' },
  });
  assert.ok(errors.some((e) => e.includes('should not be used in development')));
});

test('a fully valid production config resolves a witnessEnv ready for loadWitnessConfig()', () => {
  const config = loadTlogConfig({
    env: {
      SWALL_ENV: 'production',
      SWALL_API_BASE: 'https://swall.example/',
      WITNESS_PRIVATE_KEY: 'a-real-looking-witness-key',
    },
  });
  assert.equal(config.witnessEnv.SWALL_API_BASE, 'https://swall.example/'); // loadWitnessConfig() itself strips the trailing slash, unchanged
  assert.equal(config.witnessEnv.WITNESS_PRIVATE_KEY, 'a-real-looking-witness-key');
});

// ── Secret validation ────────────────────────────────────────────────────

test('production rejects a missing required secret with a reference-only error, never the value', () => {
  assert.throws(
    () => loadTlogConfig({ env: { SWALL_ENV: 'production', SWALL_API_BASE: 'https://swall.example' } }),
    /secretRefs\.witnessPrivateKey: required secret is missing \(source: WITNESS_PRIVATE_KEY\)/
  );
});

test('production rejects a too-short secret even when present', () => {
  assert.throws(
    () =>
      loadTlogConfig({
        env: { SWALL_ENV: 'production', SWALL_API_BASE: 'https://swall.example', WITNESS_PRIVATE_KEY: 'short' },
      }),
    /secretRefs\.witnessPrivateKey: too short/
  );
});

test('test env does not enforce secret format/strength (loadWitnessConfig-own presence check still applies unconditionally)', () => {
  assert.doesNotThrow(() =>
    loadTlogConfig({
      env: { SWALL_ENV: 'test', SWALL_API_BASE: 'https://swall.example' },
      secretsFixture: { witnessPrivateKey: 'x' }, // would fail production's minLength, accepted here
    })
  );
});
