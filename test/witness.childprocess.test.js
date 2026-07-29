'use strict';

/**
 * Direct child-process checks for the exact invocation GitHub Actions uses:
 *   node scripts/sign-sth.js
 * Covers the env-var validation and fatal()-exit-code contract. The
 * "successful mocked execution exits 0" and "invalid authority signature
 * exits 1" cases from the same requirement are exercised more fully
 * (including request/archive assertions) in test/witness.orchestration.test.js,
 * which uses this same child-process mechanism against a mock server.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { runWitnessScript } = require('./helpers/run-witness');

test('child process: missing SWALL_API_BASE exits 1 with a fatal message, before any network call', async () => {
  const result = await runWitnessScript({
    WITNESS_PRIVATE_KEY: 'irrelevant-for-this-check',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /\[witness\] FATAL: SWALL_API_BASE env var is required/);
});

test('child process: missing WITNESS_PRIVATE_KEY exits 1 with a fatal message, before any network call', async () => {
  const result = await runWitnessScript({
    SWALL_API_BASE: 'http://127.0.0.1:1', // deliberately unreachable — must never be dialed
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /\[witness\] FATAL: WITNESS_PRIVATE_KEY env var is required/);
});

test('child process: SWALL_API_BASE is checked before WITNESS_PRIVATE_KEY (current ordering)', async () => {
  // Neither var set — current code checks SWALL_API_BASE first, so that
  // must be the message reported, not the WITNESS_PRIVATE_KEY one.
  const result = await runWitnessScript({});

  assert.equal(result.code, 1);
  assert.match(result.stderr, /\[witness\] FATAL: SWALL_API_BASE env var is required/);
});

test('child process: requiring the module for its exports never calls process.exit', async () => {
  // Guards against a regression of the require.main === module refactor:
  // importing the file (as every other test in this suite does) must never
  // trigger env validation or process.exit, even with no env vars set.
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const script = path.join(__dirname, '..', 'scripts', 'sign-sth.js');
  const out = execFileSync(process.execPath, ['-e', `require(${JSON.stringify(script)}); console.log('required-ok')`], {
    env: { PATH: process.env.PATH },
  }).toString();
  assert.match(out, /required-ok/);
});
