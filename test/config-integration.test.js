'use strict';

/**
 * Proves the composition src/cli/sign-sth.ts actually performs --
 * loadTlogConfig() (config/) feeding its witnessEnv into the real
 * loadWitnessConfig() (src/witness/) -- works end-to-end. config/'s own
 * TypeScript project can't import src/witness/config.ts directly (rootDir
 * enforcement; see config/README.md), so this integration point can only be
 * exercised from outside both projects, which is what this file is for.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadTlogConfig } = require('../config/dist/index.js');
const { loadWitnessConfig } = require('../dist/witness/config.js');

test('development without a witness key: loadTlogConfig succeeds, composing it with loadWitnessConfig fails closed', () => {
  const { witnessEnv } = loadTlogConfig({ env: { SWALL_ENV: 'development', SWALL_API_BASE: 'https://swall.example' } });
  assert.throws(() => loadWitnessConfig(witnessEnv), /WITNESS_PRIVATE_KEY env var is required/);
});

test('production with a full env: the composed config matches loadWitnessConfig()-derived values exactly', () => {
  const { witnessEnv } = loadTlogConfig({
    env: {
      SWALL_ENV: 'production',
      SWALL_API_BASE: 'https://swall.example/',
      WITNESS_PRIVATE_KEY: 'a-real-looking-witness-key',
    },
  });
  const witness = loadWitnessConfig(witnessEnv);
  assert.equal(witness.swallApiBase, 'https://swall.example'); // trailing slash stripped
  assert.equal(witness.witnessPrivateKey, 'a-real-looking-witness-key');
  assert.equal(witness.witnessKeyId, 'did:web:swall.example:swall:witness#key-1');
});

test('an explicit WITNESS_KEY_ID override flows through both layers unchanged', () => {
  const { witnessEnv } = loadTlogConfig({
    env: {
      SWALL_ENV: 'production',
      SWALL_API_BASE: 'https://swall.example',
      WITNESS_PRIVATE_KEY: 'a-real-looking-witness-key',
      WITNESS_KEY_ID: 'did:web:explicit#key-1',
    },
  });
  const witness = loadWitnessConfig(witnessEnv);
  assert.equal(witness.witnessKeyId, 'did:web:explicit#key-1');
});
