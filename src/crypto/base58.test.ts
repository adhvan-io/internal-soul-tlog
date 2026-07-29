import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeBase58 } from './base58.js';
import { base58Decode as base58DecodeJs } from '../../scripts/sign-sth.js';
import { MULTIBASE_VERIFICATION_METHOD, SYNTHETIC_AUTHORITY } from '../../test/fixtures/synthetic.js';
import { decodeBase64url } from './base64url.js';

test('base58: decodes the fixed multibase fixture to the authority public key', () => {
  const decoded = decodeBase58(MULTIBASE_VERIFICATION_METHOD.publicKeyMultibase.slice(1));
  assert.equal(decoded.length, 34);
  assert.deepEqual(decoded.subarray(0, 2), Buffer.from([0xed, 0x01]));
  assert.deepEqual(decoded.subarray(2), decodeBase64url(SYNTHETIC_AUTHORITY.publicKeyB64url));
});

test('base58: current leading-byte behavior (documented quirk, not fixed)', () => {
  // '1' == 0 in base58btc; canonical base58 would preserve this as a
  // leading zero byte via count-and-prepend, which this implementation
  // does not do. Safe today only because every real multibase value here
  // has a fixed 0xed multicodec prefix byte (never 0x00). See base58.ts.
  assert.deepEqual(decodeBase58('1'), Buffer.from([0x00]));
});

test('base58: rejects invalid characters', () => {
  assert.throws(() => decodeBase58('0OIl'), /base58: invalid char/);
});

// Cross-implementation parity: TypeScript vs. the live JavaScript implementation.
test('parity: decodeBase58 matches JS base58Decode', () => {
  const inputs = [MULTIBASE_VERIFICATION_METHOD.publicKeyMultibase.slice(1), '1', 'ABCabc123'];
  for (const input of inputs) {
    assert.deepEqual(decodeBase58(input), base58DecodeJs(input));
  }
});
