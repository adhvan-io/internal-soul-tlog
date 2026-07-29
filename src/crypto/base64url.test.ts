import test from 'node:test';
import assert from 'node:assert/strict';

import { encodeBase64url, decodeBase64url } from './base64url.js';
import { fromB64url as fromB64urlJs, toB64url as toB64urlJs } from '../../scripts/sign-sth.js';
import { AUTHORITY_SIGNATURE, WITNESS_SIGNATURE } from '../../test/fixtures/synthetic.js';

test('base64url: round trip', () => {
  const raw = Buffer.from('hello world, this is a test payload!!');
  const encoded = encodeBase64url(raw);
  assert.equal(encoded.includes('+'), false);
  assert.equal(encoded.includes('/'), false);
  assert.equal(encoded.includes('='), false);
  assert.deepEqual(decodeBase64url(encoded), raw);
});

test('base64url: encode strips padding', () => {
  const encoded = encodeBase64url(Buffer.from([0x41]));
  assert.equal(encoded, 'QQ');
});

// Cross-implementation parity: TypeScript vs. the live JavaScript implementation.
test('parity: decodeBase64url matches JS fromB64url for real signature fixtures', () => {
  for (const sig of [AUTHORITY_SIGNATURE, WITNESS_SIGNATURE]) {
    assert.equal(Buffer.compare(decodeBase64url(sig), fromB64urlJs(sig)), 0);
  }
});

test('parity: encodeBase64url matches JS toB64url for arbitrary byte buffers', () => {
  for (const bytes of [Buffer.from([0x41]), Buffer.from([0, 1, 2, 3, 255]), Buffer.alloc(32, 0x7f)]) {
    assert.equal(encodeBase64url(bytes), toB64urlJs(bytes));
  }
});
