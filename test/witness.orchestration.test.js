'use strict';

/**
 * End-to-end offline tests: spawn the real `node scripts/sign-sth.js`
 * entrypoint against a loopback-only mock SWALL API and a temp-directory
 * archive. No network egress, no production credentials, no writes under
 * the real repository sth/ tree (GITHUB_WORKSPACE is always redirected to a
 * temp directory created per test).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { startMockServer } = require('./helpers/mock-server');
const { runWitnessScript } = require('./helpers/run-witness');
const {
  SYNTHETIC_WITNESS,
  WITNESS_SIGNATURE,
  WITNESS_KEY_ID,
  INVALID_AUTHORITY_SIGNATURE,
} = require('./fixtures/synthetic');
const {
  LATEST_STH_RESPONSE_FRESH,
  LATEST_STH_RESPONSE_ALREADY_COSIGNED,
  IDENTITY_DOCUMENT_MULTIBASE,
  IDENTITY_DOCUMENT_UNSUPPORTED_METHOD,
  IDENTITY_DOCUMENT_MALFORMED_MULTIBASE,
  IDENTITY_DOCUMENT_MALFORMED_JWK,
  WITNESS_POST_RESPONSE_SUCCESS,
  WITNESS_POST_RESPONSE_RACE,
  LATEST_STH_RESPONSE_MISSING_STH,
  LATEST_STH_RESPONSE_MISSING_SIGNATURE,
} = require('./fixtures/api-responses');
const {
  EXPECTED_ARCHIVE_RELATIVE_PATH,
  EXPECTED_ARCHIVE_JSON_UNWITNESSED,
  EXPECTED_ARCHIVE_JSON_WITNESSED,
} = require('./fixtures/archive');

function makeWorkspace(seedArchive) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-soul-tlog-orch-'));
  if (seedArchive) {
    const filePath = path.join(workspace, EXPECTED_ARCHIVE_RELATIVE_PATH);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, EXPECTED_ARCHIVE_JSON_UNWITNESSED);
  }
  return workspace;
}

function baseEnv(mockUrl, workspace) {
  return {
    SWALL_API_BASE: mockUrl,
    WITNESS_PRIVATE_KEY: SYNTHETIC_WITNESS.privateKeyB64url,
    WITNESS_KEY_ID, // fixed, so output doesn't depend on the mock server's ephemeral port
    GITHUB_WORKSPACE: workspace,
  };
}

// ── Success path ─────────────────────────────────────────────────────────

test('orchestration: success path — verify, sign, POST, archive update, exit 0', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
  });
  const workspace = makeWorkspace(true);
  t.after(async () => { await server.close(); fs.rmSync(workspace, { recursive: true, force: true }); });

  const result = await runWitnessScript(baseEnv(server.url, workspace));

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Authority signature verified/);
  assert.match(result.stdout, /Co-signed ✓/);

  const paths = server.calls.map(c => `${c.method} ${c.url}`);
  assert.deepEqual(paths, [
    'GET /swall/log/sth/latest',
    'GET /.well-known/swall.json',
    'POST /swall/log/sth/witness',
  ]);

  const postCall = server.calls.find(c => c.method === 'POST');
  assert.deepEqual(postCall.body, {
    sth: LATEST_STH_RESPONSE_FRESH.sth,
    witnessSignature: WITNESS_SIGNATURE,
    witnessKeyId: WITNESS_KEY_ID,
  });

  const written = fs.readFileSync(path.join(workspace, EXPECTED_ARCHIVE_RELATIVE_PATH), 'utf8');
  assert.equal(written, EXPECTED_ARCHIVE_JSON_WITNESSED);
});

// ── Fail-closed path ─────────────────────────────────────────────────────

test('orchestration: fail-closed — invalid authority signature blocks signing, POST, and archive write', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({
      body: { sth: LATEST_STH_RESPONSE_FRESH.sth, signature: INVALID_AUTHORITY_SIGNATURE },
    }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
  });
  const workspace = makeWorkspace(true);
  t.after(async () => { await server.close(); fs.rmSync(workspace, { recursive: true, force: true }); });

  const result = await runWitnessScript(baseEnv(server.url, workspace));

  assert.equal(result.code, 1);
  assert.match(result.stderr, /\[witness\] FATAL:/);
  assert.match(result.stderr, /Authority signature invalid/);

  assert.equal(server.calls.some(c => c.method === 'POST'), false, 'no witness POST must occur');

  const written = fs.readFileSync(path.join(workspace, EXPECTED_ARCHIVE_RELATIVE_PATH), 'utf8');
  assert.equal(written, EXPECTED_ARCHIVE_JSON_UNWITNESSED, 'archive must be untouched');
});

// ── Already-cosigned /latest response ───────────────────────────────────

test('orchestration: already-cosigned latest response short-circuits to archive catch-up, exit 0', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_ALREADY_COSIGNED }),
  });
  const workspace = makeWorkspace(true);
  t.after(async () => { await server.close(); fs.rmSync(workspace, { recursive: true, force: true }); });

  const result = await runWitnessScript(baseEnv(server.url, workspace));

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /already co-signed — updating archive only/);

  const paths = server.calls.map(c => `${c.method} ${c.url}`);
  assert.deepEqual(paths, ['GET /swall/log/sth/latest'], 'no identity fetch or witness POST should occur');

  const written = fs.readFileSync(path.join(workspace, EXPECTED_ARCHIVE_RELATIVE_PATH), 'utf8');
  assert.equal(written, EXPECTED_ARCHIVE_JSON_WITNESSED);
});

// ── POST race-condition response ────────────────────────────────────────

test('orchestration: POST race-condition response still signs locally and updates the archive, exit 0', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_RACE }),
  });
  const workspace = makeWorkspace(true);
  t.after(async () => { await server.close(); fs.rmSync(workspace, { recursive: true, force: true }); });

  const result = await runWitnessScript(baseEnv(server.url, workspace));

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /already co-signed \(race\) — ok/);
  assert.equal(server.calls.some(c => c.method === 'POST'), true, 'local signing + POST must still occur');

  const written = fs.readFileSync(path.join(workspace, EXPECTED_ARCHIVE_RELATIVE_PATH), 'utf8');
  assert.equal(written, EXPECTED_ARCHIVE_JSON_WITNESSED);
});

// ── Malformed responses (current behavior pinned, not "improved") ───────

test('orchestration: DEFECT-adjacent, current behavior — missing sth in /latest response is fatal', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_MISSING_STH }),
  });
  const workspace = makeWorkspace(false);
  t.after(async () => { await server.close(); fs.rmSync(workspace, { recursive: true, force: true }); });

  const result = await runWitnessScript(baseEnv(server.url, workspace));

  assert.equal(result.code, 1);
  assert.match(result.stderr, /\[witness\] FATAL: Malformed STH response: missing sth or signature/);
});

test('orchestration: current behavior — missing signature in /latest response is fatal', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_MISSING_SIGNATURE }),
  });
  const workspace = makeWorkspace(false);
  t.after(async () => { await server.close(); fs.rmSync(workspace, { recursive: true, force: true }); });

  const result = await runWitnessScript(baseEnv(server.url, workspace));

  assert.equal(result.code, 1);
  assert.match(result.stderr, /\[witness\] FATAL: Malformed STH response: missing sth or signature/);
});

test('orchestration: current behavior — unsupported verificationMethod format is fatal', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_UNSUPPORTED_METHOD }),
  });
  const workspace = makeWorkspace(true);
  t.after(async () => { await server.close(); fs.rmSync(workspace, { recursive: true, force: true }); });

  const result = await runWitnessScript(baseEnv(server.url, workspace));

  assert.equal(result.code, 1);
  assert.match(result.stderr, /\[witness\] FATAL: Cannot parse authority public key: Unsupported verificationMethod format/);
});

test('orchestration: current behavior — malformed (too-short) multibase key is fatal, cleanly', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MALFORMED_MULTIBASE }),
  });
  const workspace = makeWorkspace(true);
  t.after(async () => { await server.close(); fs.rmSync(workspace, { recursive: true, force: true }); });

  const result = await runWitnessScript(baseEnv(server.url, workspace));

  assert.equal(result.code, 1);
  assert.match(result.stderr, /\[witness\] FATAL: Cannot parse authority public key: Unexpected multibase key length/);
});

test('orchestration: DEFECT (documented, not fixed) — malformed JWK key crashes uncaught, not via fatal()', async (t) => {
  // extractAuthorityPublicKey has no length check on the JWK path, so this
  // does NOT produce a clean "[witness] FATAL: Cannot parse authority
  // public key: ..." message. It fails a step later (rawBytesToPublicKey),
  // outside the try/catch that wraps extractAuthorityPublicKey, as a raw
  // uncaught Node exception. Still exits non-zero (fail-closed in effect),
  // but with an uncontrolled message format. Captured as-is per Phase 18-C
  // scope; see test/witness.unit.test.js for the isolated version.
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MALFORMED_JWK }),
  });
  const workspace = makeWorkspace(true);
  t.after(async () => { await server.close(); fs.rmSync(workspace, { recursive: true, force: true }); });

  const result = await runWitnessScript(baseEnv(server.url, workspace));

  assert.notEqual(result.code, 0, 'must still fail non-zero');
  assert.equal(result.stderr.includes('[witness] FATAL:'), false, 'current behavior: NOT routed through fatal()');
  assert.match(result.stderr, /Failed to read asymmetric key/);

  const written = fs.readFileSync(path.join(workspace, EXPECTED_ARCHIVE_RELATIVE_PATH), 'utf8');
  assert.equal(written, EXPECTED_ARCHIVE_JSON_UNWITNESSED, 'archive must be untouched');
});
