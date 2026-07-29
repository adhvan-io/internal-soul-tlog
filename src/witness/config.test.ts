/**
 * Unit tests for config.ts. Direct JavaScript-versus-TypeScript parity for
 * witnessKeyId derivation lives in witness.test.ts instead of here: the
 * derivation logic isn't an independently-exported JS function (it's
 * inline in scripts/sign-sth.js's main flow), so proving parity requires
 * observing the real POST body through the full mock-server + child-process
 * flow, which needs the integration suite's infrastructure.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadWitnessConfig, deriveWitnessKeyId } from './config.js';

// ── deriveWitnessKeyId ───────────────────────────────────────────────────

test('deriveWitnessKeyId: explicit value always wins', () => {
  assert.equal(deriveWitnessKeyId('https://swall.example', 'did:web:custom#key-1'), 'did:web:custom#key-1');
});

test('deriveWitnessKeyId: empty explicit value falls through to the fallback, matching JS ||', () => {
  const result = deriveWitnessKeyId('https://swall.example', '');
  assert.notEqual(result, '');
  assert.match(result, /^did:web:/);
});

test('deriveWitnessKeyId: fallback derives from the host, percent-encoding the port colon', () => {
  const result = deriveWitnessKeyId('http://127.0.0.1:8080', undefined);
  assert.equal(result, 'did:web:127.0.0.1%3A8080:swall:witness#key-1');
});

test('deriveWitnessKeyId: fallback uses the literal "swall-api" host when the base URL has no protocol match', () => {
  const result = deriveWitnessKeyId('not-a-url', undefined);
  assert.equal(result, 'did:web:swall-api:swall:witness#key-1');
});

// ── loadWitnessConfig ────────────────────────────────────────────────────

test('loadWitnessConfig: missing SWALL_API_BASE throws the exact production message', () => {
  assert.throws(
    () => loadWitnessConfig({ WITNESS_PRIVATE_KEY: 'irrelevant' }),
    /SWALL_API_BASE env var is required/
  );
});

test('loadWitnessConfig: missing WITNESS_PRIVATE_KEY throws the exact production message', () => {
  assert.throws(
    () => loadWitnessConfig({ SWALL_API_BASE: 'https://swall.example' }),
    /WITNESS_PRIVATE_KEY env var is required/
  );
});

test('loadWitnessConfig: SWALL_API_BASE is checked before WITNESS_PRIVATE_KEY, matching production ordering', () => {
  assert.throws(() => loadWitnessConfig({}), /SWALL_API_BASE env var is required/);
});

test('loadWitnessConfig: trailing slash on SWALL_API_BASE is stripped', () => {
  const config = loadWitnessConfig({
    SWALL_API_BASE: 'https://swall.example/',
    WITNESS_PRIVATE_KEY: 'irrelevant',
  });
  assert.equal(config.swallApiBase, 'https://swall.example');
});

test('loadWitnessConfig: repoRoot falls back to process.cwd() when GITHUB_WORKSPACE is unset', () => {
  const config = loadWitnessConfig({
    SWALL_API_BASE: 'https://swall.example',
    WITNESS_PRIVATE_KEY: 'irrelevant',
  });
  assert.equal(config.repoRoot, process.cwd());
});

test('loadWitnessConfig: repoRoot uses GITHUB_WORKSPACE when set', () => {
  const config = loadWitnessConfig({
    SWALL_API_BASE: 'https://swall.example',
    WITNESS_PRIVATE_KEY: 'irrelevant',
    GITHUB_WORKSPACE: '/workspace/internal-soul-tlog',
  });
  assert.equal(config.repoRoot, '/workspace/internal-soul-tlog');
});

test('loadWitnessConfig: witnessKeyId is resolved from the explicit env var when set', () => {
  const config = loadWitnessConfig({
    SWALL_API_BASE: 'https://swall.example',
    WITNESS_PRIVATE_KEY: 'irrelevant',
    WITNESS_KEY_ID: 'did:web:explicit#key-1',
  });
  assert.equal(config.witnessKeyId, 'did:web:explicit#key-1');
});

test('loadWitnessConfig: witnessKeyId falls back to the DID derivation when unset', () => {
  const config = loadWitnessConfig({
    SWALL_API_BASE: 'https://swall.example',
    WITNESS_PRIVATE_KEY: 'irrelevant',
  });
  assert.equal(config.witnessKeyId, 'did:web:swall.example:swall:witness#key-1');
});
