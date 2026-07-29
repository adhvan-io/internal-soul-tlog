/**
 * Complete end-to-end orchestration tests. Every server is loopback-only
 * (127.0.0.1); every archive root is a fresh fs.mkdtempSync temp
 * directory; every key is synthetic. No external network, no real
 * credentials, no real archive mutation.
 *
 * Two sections at the bottom ("Cross-implementation parity") spawn the
 * real scripts/sign-sth.js as a child process (reusing
 * test/helpers/run-witness.js from Stage 0) to compare actual observed
 * behavior against this TypeScript implementation -- including two
 * deliberate, documented divergences. See README.md.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { runWitness } from './witness.js';
import { deriveWitnessKeyId } from './config.js';
import type { WitnessConfig } from './config.js';
import { startMockServer } from '../../test/helpers/mock-server.js';
import { runWitnessScript } from '../../test/helpers/run-witness.js';
import {
  FIXED_STH,
  SYNTHETIC_WITNESS,
  WITNESS_SIGNATURE,
  WITNESS_KEY_ID,
  AUTHORITY_SIGNATURE,
  INVALID_AUTHORITY_SIGNATURE,
  MULTIBASE_VERIFICATION_METHOD,
  JWK_VERIFICATION_METHOD,
  WITNESSED_AT,
} from '../../test/fixtures/synthetic.js';
import {
  LATEST_STH_RESPONSE_FRESH,
  LATEST_STH_RESPONSE_ALREADY_COSIGNED,
  IDENTITY_DOCUMENT_MULTIBASE,
  IDENTITY_DOCUMENT_JWK,
  WITNESS_POST_RESPONSE_SUCCESS,
  WITNESS_POST_RESPONSE_RACE,
  LATEST_STH_RESPONSE_MISSING_STH,
} from '../../test/fixtures/api-responses.js';
import {
  EXPECTED_ARCHIVE_RELATIVE_PATH,
  EXPECTED_ARCHIVE_JSON_UNWITNESSED,
  EXPECTED_ARCHIVE_JSON_WITNESSED,
  WITNESSED_RECORD,
} from '../../test/fixtures/archive.js';

function makeTempRepoRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'internal-soul-tlog-witness-test-'));
}

function seedUnwitnessedArchive(repoRoot: string): string {
  const filePath = path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, EXPECTED_ARCHIVE_JSON_UNWITNESSED);
  return filePath;
}

function seedWitnessedArchive(repoRoot: string): string {
  const filePath = path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, EXPECTED_ARCHIVE_JSON_WITNESSED);
  return filePath;
}

function baseConfig(baseUrl: string, repoRoot: string): WitnessConfig {
  return {
    swallApiBase: baseUrl,
    witnessPrivateKey: SYNTHETIC_WITNESS.privateKeyB64url,
    witnessKeyId: WITNESS_KEY_ID,
    repoRoot,
  };
}

// ── Full successful witness flow ─────────────────────────────────────────

test('witness: full successful flow (multibase authority key) -- witnessed, byte-identical archive and POST body', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });
  const archivePath = seedUnwitnessedArchive(repoRoot);

  const outcome = await runWitness(baseConfig(server.url, repoRoot));

  assert.deepEqual(outcome, { status: 'witnessed', treeSize: FIXED_STH.treeSize });

  const postCall = server.calls.find(c => c.method === 'POST')!;
  assert.deepEqual(postCall.body, { sth: FIXED_STH, witnessSignature: WITNESS_SIGNATURE, witnessKeyId: WITNESS_KEY_ID });
  assert.equal(postCall.headers['content-type'], 'application/json');

  const written = fs.readFileSync(archivePath);
  assert.equal(Buffer.compare(written, Buffer.from(EXPECTED_ARCHIVE_JSON_WITNESSED)), 0);
});

test('witness: full successful flow (JWK authority key) -- witnessed', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_JWK }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });
  seedUnwitnessedArchive(repoRoot);

  const outcome = await runWitness(baseConfig(server.url, repoRoot));
  assert.deepEqual(outcome, { status: 'witnessed', treeSize: FIXED_STH.treeSize });
});

// ── Fail-closed: invalid authority signature ─────────────────────────────

test('witness: invalid authority signature -- no POST, no archive write, deterministic failure', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: { sth: FIXED_STH, signature: INVALID_AUTHORITY_SIGNATURE } }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });
  const archivePath = seedUnwitnessedArchive(repoRoot);

  await assert.rejects(
    () => runWitness(baseConfig(server.url, repoRoot)),
    /Authority signature invalid for treeSize=42 — refusing to co-sign/
  );

  assert.equal(server.calls.some(c => c.method === 'POST'), false, 'no witness POST must occur');
  assert.equal(Buffer.compare(fs.readFileSync(archivePath), Buffer.from(EXPECTED_ARCHIVE_JSON_UNWITNESSED)), 0, 'archive must be untouched');
});

// ── Idempotency path 1: latest-response already witnessed ───────────────

test('witness: latest-response already witnessed -- no identity fetch, no signing, no POST, archive catch-up', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_ALREADY_COSIGNED }),
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });
  const archivePath = seedUnwitnessedArchive(repoRoot);

  const outcome = await runWitness(baseConfig(server.url, repoRoot));

  assert.deepEqual(outcome, { status: 'already-witnessed', treeSize: FIXED_STH.treeSize });
  assert.deepEqual(server.calls.map(c => `${c.method} ${c.url}`), ['GET /swall/log/sth/latest']);
  assert.equal(Buffer.compare(fs.readFileSync(archivePath), Buffer.from(EXPECTED_ARCHIVE_JSON_WITNESSED)), 0);
});

// ── Idempotency path 2: POST race / already-cosigned ─────────────────────

test('witness: POST race response -- local signing and POST still occur, archive still updated', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_RACE }),
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });
  const archivePath = seedUnwitnessedArchive(repoRoot);

  const outcome = await runWitness(baseConfig(server.url, repoRoot));

  assert.deepEqual(outcome, { status: 'race-lost', treeSize: FIXED_STH.treeSize });
  assert.equal(server.calls.some(c => c.method === 'POST'), true, 'local signing + POST must still occur');
  assert.equal(Buffer.compare(fs.readFileSync(archivePath), Buffer.from(EXPECTED_ARCHIVE_JSON_WITNESSED)), 0);
});

// ── Malformed responses (documented message-text divergence from JS -- see README.md) ──

test('witness: malformed latest STH response is rejected (wrapped as "Failed to fetch STH: ...")', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_MISSING_STH }),
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });

  await assert.rejects(() => runWitness(baseConfig(server.url, repoRoot)), /Failed to fetch STH:/);
});

test('witness: malformed identity document is rejected (wrapped as "Failed to fetch authority identity: ...")', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: {} }), // no verificationMethod at all
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });

  await assert.rejects(() => runWitness(baseConfig(server.url, repoRoot)), /Failed to fetch authority identity:/);
});

test('witness: malformed witness POST response is rejected (wrapped as "Failed to submit co-signature: ...")', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: { alreadyCosigned: 'yes' } }), // wrong primitive type
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });

  await assert.rejects(() => runWitness(baseConfig(server.url, repoRoot)), /Failed to submit co-signature:/);
});

// ── Archive edge cases ────────────────────────────────────────────────────

test('witness: archive missing -- flow still reports "witnessed", no file is created', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });
  // Deliberately not seeding an archive file.

  const outcome = await runWitness(baseConfig(server.url, repoRoot));

  assert.deepEqual(outcome, { status: 'witnessed', treeSize: FIXED_STH.treeSize });
  assert.equal(fs.existsSync(path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH)), false);
});

test('witness: archive already witnessed on disk -- left byte-identical, outcome still "witnessed"', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });
  const archivePath = seedWitnessedArchive(repoRoot);

  const outcome = await runWitness(baseConfig(server.url, repoRoot));

  assert.deepEqual(outcome, { status: 'witnessed', treeSize: FIXED_STH.treeSize });
  assert.equal(Buffer.compare(fs.readFileSync(archivePath), Buffer.from(EXPECTED_ARCHIVE_JSON_WITNESSED)), 0);
});

test('witness: malformed archive JSON propagates uncaught, matching production', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });
  const filePath = path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'this is not { valid json');

  await assert.rejects(() => runWitness(baseConfig(server.url, repoRoot)), SyntaxError);
});

// ── witnessedAt fallback (injected clock) ────────────────────────────────

test('witness: witnessedAt falls back to the injected clock when the POST response omits it', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: { treeSize: FIXED_STH.treeSize } }), // no witnessedAt
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });
  const archivePath = seedUnwitnessedArchive(repoRoot);

  await runWitness(baseConfig(server.url, repoRoot), { now: () => '2020-01-01T00:05:00.000Z' });

  const written: { witnessedAt: string } = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
  assert.equal(written.witnessedAt, '2020-01-01T00:05:00.000Z');
});

// ── Cross-implementation parity: TypeScript vs. the live JavaScript implementation ──

test('parity: full successful flow -- identical request sequence, POST body, and archive bytes', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
  });
  const tsRoot = makeTempRepoRoot();
  const jsRoot = makeTempRepoRoot();
  t.after(async () => {
    await server.close();
    fs.rmSync(tsRoot, { recursive: true, force: true });
    fs.rmSync(jsRoot, { recursive: true, force: true });
  });
  seedUnwitnessedArchive(tsRoot);
  seedUnwitnessedArchive(jsRoot);

  const tsOutcome = await runWitness(baseConfig(server.url, tsRoot));
  assert.equal(tsOutcome.status, 'witnessed');
  const tsCalls = [...server.calls];
  server.calls.length = 0;

  const jsResult = await runWitnessScript({
    SWALL_API_BASE: server.url,
    WITNESS_PRIVATE_KEY: SYNTHETIC_WITNESS.privateKeyB64url,
    WITNESS_KEY_ID,
    GITHUB_WORKSPACE: jsRoot,
  });
  assert.equal(jsResult.code, 0, jsResult.stderr);

  assert.deepEqual(tsCalls.map(c => `${c.method} ${c.url}`), server.calls.map(c => `${c.method} ${c.url}`));
  assert.equal(
    Buffer.compare(
      fs.readFileSync(path.join(tsRoot, EXPECTED_ARCHIVE_RELATIVE_PATH)),
      fs.readFileSync(path.join(jsRoot, EXPECTED_ARCHIVE_RELATIVE_PATH))
    ),
    0
  );
});

test('parity: witnessKeyId explicit value -- TS and live JS agree on the POST body value', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
  });
  const jsRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(jsRoot, { recursive: true, force: true }); });
  seedUnwitnessedArchive(jsRoot);

  const explicit = 'did:web:explicit-test-value#key-1';
  const jsResult = await runWitnessScript({
    SWALL_API_BASE: server.url,
    WITNESS_PRIVATE_KEY: SYNTHETIC_WITNESS.privateKeyB64url,
    WITNESS_KEY_ID: explicit,
    GITHUB_WORKSPACE: jsRoot,
  });
  assert.equal(jsResult.code, 0, jsResult.stderr);

  const jsWitnessKeyId = (server.calls.find(c => c.method === 'POST')!.body as { witnessKeyId: string }).witnessKeyId;
  assert.equal(jsWitnessKeyId, explicit);
  assert.equal(deriveWitnessKeyId(server.url, explicit), explicit);
});

test('parity: witnessKeyId DID fallback -- TS derivation matches the value the live JS actually POSTs', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
  });
  const jsRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(jsRoot, { recursive: true, force: true }); });
  seedUnwitnessedArchive(jsRoot);

  const jsResult = await runWitnessScript({
    SWALL_API_BASE: server.url,
    WITNESS_PRIVATE_KEY: SYNTHETIC_WITNESS.privateKeyB64url,
    // WITNESS_KEY_ID deliberately unset -- exercise the DID fallback.
    GITHUB_WORKSPACE: jsRoot,
  });
  assert.equal(jsResult.code, 0, jsResult.stderr);

  const jsWitnessKeyId = (server.calls.find(c => c.method === 'POST')!.body as { witnessKeyId: string }).witnessKeyId;
  assert.equal(deriveWitnessKeyId(server.url, undefined), jsWitnessKeyId);
});

test('parity: DOCUMENTED DIVERGENCE -- malformed witness POST response: JS silently accepts it as a truthy race, TS rejects it', async (t) => {
  // Stage 4 already added shape validation to postWitnessSignature() that
  // JS's fully-permissive `result.alreadyCosigned` property access never
  // had. This isn't a new choice made in this stage -- it's Stage 4's
  // existing, already-tested behavior, surfaced here for the first time in
  // a full end-to-end composition. Documented, not "fixed" in either
  // direction. See README.md.
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: { alreadyCosigned: 'yes' } }),
  });
  const tsRoot = makeTempRepoRoot();
  const jsRoot = makeTempRepoRoot();
  t.after(async () => {
    await server.close();
    fs.rmSync(tsRoot, { recursive: true, force: true });
    fs.rmSync(jsRoot, { recursive: true, force: true });
  });
  seedUnwitnessedArchive(tsRoot);
  seedUnwitnessedArchive(jsRoot);

  await assert.rejects(() => runWitness(baseConfig(server.url, tsRoot)), /Failed to submit co-signature:/);

  const jsResult = await runWitnessScript({
    SWALL_API_BASE: server.url,
    WITNESS_PRIVATE_KEY: SYNTHETIC_WITNESS.privateKeyB64url,
    WITNESS_KEY_ID,
    GITHUB_WORKSPACE: jsRoot,
  });
  // JS does NOT fail here: the string "yes" is truthy, so it takes the
  // "already co-signed (race) — ok" branch and updates the archive.
  assert.equal(jsResult.code, 0, jsResult.stderr);
  assert.match(jsResult.stdout, /already co-signed \(race\) — ok/);
});

test('parity: DOCUMENTED DIVERGENCE -- malformed latest STH response: different fatal message, same fail-closed exit-1 outcome', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_MISSING_STH }),
  });
  const repoRoot = makeTempRepoRoot();
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });

  await assert.rejects(() => runWitness(baseConfig(server.url, repoRoot)), /Failed to fetch STH: Invalid latest STH response/);

  const jsResult = await runWitnessScript({
    SWALL_API_BASE: server.url,
    WITNESS_PRIVATE_KEY: SYNTHETIC_WITNESS.privateKeyB64url,
  });
  assert.equal(jsResult.code, 1);
  assert.match(jsResult.stderr, /\[witness\] FATAL: Malformed STH response: missing sth or signature/);
});
