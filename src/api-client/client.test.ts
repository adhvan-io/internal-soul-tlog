/**
 * Offline tests for the SWALL API client. Every server is a loopback-only
 * (127.0.0.1) HTTP server started per test and torn down afterward -- no
 * external network access, no production endpoint, no production
 * credentials. Fixtures are reused from test/fixtures/ (Stage 0); none are
 * duplicated here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSwallApiClient } from './client.js';
import { startMockServer } from '../../test/helpers/mock-server.js';
import { FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID } from '../../test/fixtures/synthetic.js';
import {
  LATEST_STH_RESPONSE_FRESH,
  LATEST_STH_RESPONSE_ALREADY_COSIGNED,
  IDENTITY_DOCUMENT_MULTIBASE,
  IDENTITY_DOCUMENT_JWK,
  WITNESS_POST_RESPONSE_SUCCESS,
  WITNESS_POST_RESPONSE_RACE,
  LATEST_STH_RESPONSE_MISSING_STH,
  LATEST_STH_RESPONSE_MISSING_SIGNATURE,
} from '../../test/fixtures/api-responses.js';
import type { WitnessPostRequest } from '../protocol/types.js';

const WITNESS_POST_REQUEST: WitnessPostRequest = {
  sth: FIXED_STH,
  witnessSignature: WITNESS_SIGNATURE,
  witnessKeyId: WITNESS_KEY_ID,
};

// ── getLatestSTH ─────────────────────────────────────────────────────────

test('getLatestSTH: valid fresh (unwitnessed) response', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  const result = await client.getLatestSTH();
  assert.equal('witnessSignature' in result, false);
  assert.deepEqual(result.sth, FIXED_STH);
});

test('getLatestSTH: valid already-cosigned response', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_ALREADY_COSIGNED }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  const result = await client.getLatestSTH();
  assert.equal('witnessSignature' in result, true);
});

test('getLatestSTH: malformed (non-JSON) response body is rejected', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ rawBody: 'this is not JSON {{{' }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  await assert.rejects(() => client.getLatestSTH());
});

test('getLatestSTH: invalid protocol shape (missing sth) is rejected', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_MISSING_STH }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  await assert.rejects(() => client.getLatestSTH());
});

test('getLatestSTH: invalid protocol shape (missing signature) is rejected', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_MISSING_SIGNATURE }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  await assert.rejects(() => client.getLatestSTH());
});

test('getLatestSTH: non-success HTTP status is rejected with the status in the message', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ status: 500, body: { error: 'boom' } }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  await assert.rejects(() => client.getLatestSTH(), /HTTP 500/);
});

test('getLatestSTH: transport failure (nothing listening) is rejected', async () => {
  // Port 1 is a privileged port essentially never listened on -- a real,
  // local, always-failing connection attempt, not a live network dependency.
  const client = createSwallApiClient({ baseUrl: 'http://127.0.0.1:1' });
  await assert.rejects(() => client.getLatestSTH());
});

// ── getIdentityDocument ──────────────────────────────────────────────────

test('getIdentityDocument: valid multibase method', async (t) => {
  const server = await startMockServer({
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  const doc = await client.getIdentityDocument();
  assert.deepEqual(doc, IDENTITY_DOCUMENT_MULTIBASE);
});

test('getIdentityDocument: valid JWK method', async (t) => {
  const server = await startMockServer({
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_JWK }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  const doc = await client.getIdentityDocument();
  assert.deepEqual(doc, IDENTITY_DOCUMENT_JWK);
});

test('getIdentityDocument: missing verificationMethod is rejected', async (t) => {
  const server = await startMockServer({
    'GET /.well-known/swall.json': () => ({ body: {} }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  await assert.rejects(() => client.getIdentityDocument());
});

test('getIdentityDocument: empty verificationMethod array is rejected', async (t) => {
  const server = await startMockServer({
    'GET /.well-known/swall.json': () => ({ body: { verificationMethod: [] } }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  await assert.rejects(() => client.getIdentityDocument());
});

test('getIdentityDocument: malformed (non-JSON) response body is rejected', async (t) => {
  const server = await startMockServer({
    'GET /.well-known/swall.json': () => ({ rawBody: '<html>not json</html>' }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  await assert.rejects(() => client.getIdentityDocument());
});

test('getIdentityDocument: non-success HTTP status is rejected', async (t) => {
  const server = await startMockServer({
    'GET /.well-known/swall.json': () => ({ status: 404, body: { error: 'not found' } }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  await assert.rejects(() => client.getIdentityDocument(), /HTTP 404/);
});

// ── postWitnessSignature ─────────────────────────────────────────────────

test('postWitnessSignature: exact method, URL, headers, and body', async (t) => {
  const server = await startMockServer({
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  await client.postWitnessSignature(WITNESS_POST_REQUEST);

  assert.equal(server.calls.length, 1);
  const call = server.calls[0]!;
  assert.equal(call.method, 'POST');
  assert.equal(call.url, '/swall/log/sth/witness');
  assert.equal(call.headers['content-type'], 'application/json');
  assert.deepEqual(call.body, WITNESS_POST_REQUEST);
});

test('postWitnessSignature: success response', async (t) => {
  const server = await startMockServer({
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  const result = await client.postWitnessSignature(WITNESS_POST_REQUEST);
  assert.deepEqual(result, WITNESS_POST_RESPONSE_SUCCESS);
});

test('postWitnessSignature: already-cosigned (race) response', async (t) => {
  const server = await startMockServer({
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_RACE }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  const result = await client.postWitnessSignature(WITNESS_POST_REQUEST);
  assert.equal(result.alreadyCosigned, true);
});

test('postWitnessSignature: malformed response is rejected', async (t) => {
  const server = await startMockServer({
    'POST /swall/log/sth/witness': () => ({ body: { alreadyCosigned: 'yes' } }), // wrong primitive type
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  await assert.rejects(() => client.postWitnessSignature(WITNESS_POST_REQUEST));
});

test('postWitnessSignature: non-success HTTP status includes response body text in the error', async (t) => {
  const server = await startMockServer({
    'POST /swall/log/sth/witness': () => ({ status: 409, rawBody: 'conflict: stale tree size' }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: server.url });
  await assert.rejects(() => client.postWitnessSignature(WITNESS_POST_REQUEST), /HTTP 409.*conflict: stale tree size/s);
});

// ── Base URL normalization ───────────────────────────────────────────────

test('trailing slash on baseUrl is stripped, matching scripts/sign-sth.js', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
  });
  t.after(() => server.close());

  const client = createSwallApiClient({ baseUrl: `${server.url}/` });
  await client.getLatestSTH();
  assert.equal(server.calls[0]!.url, '/swall/log/sth/latest');
});
