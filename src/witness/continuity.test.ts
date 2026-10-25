/**
 * Audit G6: the witness co-signs a tree head only if it extends the last head
 * it co-signed. Unit tests for the Merkle root and the continuity rule, then
 * full witness runs against a loopback mock API: consistent growth is
 * co-signed and recorded; a fork, a rollback or a swapped authority key is
 * refused before any witness signature is computed or posted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';

import { merkleRoot, parseConsistencyResponse } from '../protocol/merkle.js';
import { checkContinuity, readWitnessState, writeWitnessState } from './continuity.js';
import { runWitness } from './witness.js';
import type { WitnessConfig } from './config.js';
import { canonicalPayloadBytes } from '../crypto/canonical.js';
import { signPayload } from '../crypto/ed25519.js';
import { importPrivateKey } from '../crypto/keys.js';
import { decodeBase64url } from '../crypto/base64url.js';
import { startMockServer } from '../../test/helpers/mock-server.js';
import { FIXED_STH, SYNTHETIC_AUTHORITY, SYNTHETIC_WITNESS, WITNESS_KEY_ID } from '../../test/fixtures/synthetic.js';
import { IDENTITY_DOCUMENT_MULTIBASE, WITNESS_POST_RESPONSE_SUCCESS } from '../../test/fixtures/api-responses.js';

const leafHash = (i: number) => createHash('sha256').update(Buffer.from([0x00])).update(`entry-${i}`).digest('hex');
const LEAVES = Array.from({ length: 50 }, (_, i) => leafHash(i));

// Independent RFC 6962 MTH (split at the largest power of two below n), to check merkleRoot.
function rfc6962(leaves: string[]): string {
  if (leaves.length === 0) return createHash('sha256').update(Buffer.alloc(0)).digest('hex');
  if (leaves.length === 1) return leaves[0] as string;
  let k = 1;
  while (k * 2 < leaves.length) k *= 2;
  return createHash('sha256').update(Buffer.from([0x01]))
    .update(Buffer.from(rfc6962(leaves.slice(0, k)), 'hex'))
    .update(Buffer.from(rfc6962(leaves.slice(k)), 'hex')).digest('hex');
}

test('merkleRoot equals the RFC 6962 Merkle Tree Hash for every size 0..50', () => {
  for (let n = 0; n <= 50; n++) assert.equal(merkleRoot(LEAVES.slice(0, n)), rfc6962(LEAVES.slice(0, n)), `size ${n}`);
});

test('parseConsistencyResponse requires every leaf up to `to`, hex-encoded', () => {
  assert.deepEqual(parseConsistencyResponse({ from: 2, to: 3, leaf_hashes: LEAVES.slice(0, 3) }, 2, 3), LEAVES.slice(0, 3));
  assert.throws(() => parseConsistencyResponse({ from: 2, to: 3, leaf_hashes: LEAVES.slice(0, 2) }, 2, 3));
  assert.throws(() => parseConsistencyResponse({ from: 2, to: 3, leaf_hashes: ['zz', 'zz', 'zz'] }, 2, 3));
  assert.throws(() => parseConsistencyResponse({ from: 1, to: 3, leaf_hashes: LEAVES.slice(0, 3) }, 2, 3));
});

test('checkContinuity: first use, same head, growth, fork, rollback', () => {
  const head = (n: number, leaves = LEAVES) => ({ ...FIXED_STH, treeSize: n, root: merkleRoot(leaves.slice(0, n)) });
  const prev = { treeSize: 40, root: merkleRoot(LEAVES.slice(0, 40)), witnessedAt: 'x' };

  assert.equal(checkContinuity(null, head(40)).ok, true);
  assert.equal(checkContinuity(prev, head(40)).ok, true);
  assert.equal(checkContinuity(prev, head(45), LEAVES.slice(0, 45)).ok, true);

  assert.match(checkContinuity(prev, { ...head(40), root: 'f'.repeat(64) }).reason, /fork/);
  assert.match(checkContinuity(prev, head(39)).reason, /rollback/);
  assert.match(checkContinuity(prev, head(45)).reason, /missing/);

  const rewritten = [...LEAVES];
  rewritten[3] = leafHash(999);
  const forked = head(45, rewritten);
  assert.match(checkContinuity(prev, forked, rewritten.slice(0, 45)).reason, /fork/);
  assert.match(checkContinuity(prev, head(45), [...LEAVES.slice(0, 44), leafHash(998)]).reason, /new root/);
});

// ── Full witness runs ────────────────────────────────────────────────────────

function signedHead(treeSize: number, leaves = LEAVES) {
  const sth = { ...FIXED_STH, treeSize, root: merkleRoot(leaves.slice(0, treeSize)) };
  const signature = signPayload(canonicalPayloadBytes(sth), importPrivateKey(decodeBase64url(SYNTHETIC_AUTHORITY.privateKeyB64url)));
  return { sth, signature };
}

function config(baseUrl: string, repoRoot: string, extra: Partial<WitnessConfig> = {}): WitnessConfig {
  return { swallApiBase: baseUrl, witnessPrivateKey: SYNTHETIC_WITNESS.privateKeyB64url, witnessKeyId: WITNESS_KEY_ID, repoRoot, ...extra };
}

async function setup(t: test.TestContext, latest: object, leaves: string[], prev?: number) {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: latest }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
    ...(prev !== undefined && {
      [`GET /swall/log/consistency?from=${prev}&to=${(latest as { sth: { treeSize: number } }).sth.treeSize}`]:
        () => ({ body: { from: prev, to: (latest as { sth: { treeSize: number } }).sth.treeSize, leaf_hashes: leaves } }),
    }),
  });
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-soul-tlog-continuity-'));
  if (prev !== undefined) writeWitnessState(repoRoot, { treeSize: prev, root: merkleRoot(LEAVES.slice(0, prev)), witnessedAt: 'earlier' });
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });
  return { server, repoRoot };
}

const posted = (server: { calls: { method: string }[] }) => server.calls.filter((c) => c.method === 'POST').length;

test('witness co-signs a head that extends the last one, and records it', async (t) => {
  const latest = signedHead(42);
  const { server, repoRoot } = await setup(t, latest, LEAVES.slice(0, 42), 40);
  const outcome = await runWitness(config(server.url, repoRoot));
  assert.equal(outcome.status, 'witnessed');
  assert.equal(posted(server), 1);
  assert.deepEqual(readWitnessState(repoRoot)?.treeSize, 42);
  assert.equal(readWitnessState(repoRoot)?.root, latest.sth.root);
});

test('witness refuses a forked log before signing or posting', async (t) => {
  const rewritten = [...LEAVES];
  rewritten[7] = leafHash(777);
  const latest = signedHead(42, rewritten);
  const { server, repoRoot } = await setup(t, latest, rewritten.slice(0, 42), 40);
  await assert.rejects(() => runWitness(config(server.url, repoRoot)), /Refusing to co-sign treeSize=42: fork/);
  assert.equal(posted(server), 0);
  assert.equal(readWitnessState(repoRoot)?.treeSize, 40, 'state unchanged');
});

test('witness refuses a rollback', async (t) => {
  const latest = signedHead(38);
  const { server, repoRoot } = await setup(t, latest, [], 40);
  await assert.rejects(() => runWitness(config(server.url, repoRoot)), /rollback/);
  assert.equal(posted(server), 0);
});

test('witness refuses when the served authority key differs from the pinned one', async (t) => {
  const latest = signedHead(42);
  const { server, repoRoot } = await setup(t, latest, LEAVES.slice(0, 42), 40);
  const otherKey = SYNTHETIC_WITNESS.publicKeyB64url;
  await assert.rejects(() => runWitness(config(server.url, repoRoot, { authorityPublicKey: otherKey })), /pinned/);
  assert.equal(posted(server), 0);
  const ok = await runWitness(config(server.url, repoRoot, { authorityPublicKey: SYNTHETIC_AUTHORITY.publicKeyB64url }));
  assert.equal(ok.status, 'witnessed');
});
