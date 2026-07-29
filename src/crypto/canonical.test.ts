import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalPayloadBytes } from './canonical.js';
import { canonicalPayload as canonicalPayloadJs } from '../../scripts/sign-sth.js';
import { FIXED_STH, CANONICAL_PAYLOAD_STRING, CANONICAL_PAYLOAD_HEX } from '../../test/fixtures/synthetic.js';

test('canonical: matches the frozen Stage 0 fixture bytes', () => {
  const payload = canonicalPayloadBytes(FIXED_STH);
  assert.equal(payload.toString('utf8'), CANONICAL_PAYLOAD_STRING);
  assert.equal(payload.toString('hex'), CANONICAL_PAYLOAD_HEX);
});

// Cross-implementation parity: TypeScript vs. the live JavaScript implementation.
test('parity: canonicalPayloadBytes(FIXED_STH) is byte-identical to the JS canonicalPayload(FIXED_STH)', () => {
  const ts = canonicalPayloadBytes(FIXED_STH);
  const js = canonicalPayloadJs(FIXED_STH);
  assert.equal(Buffer.compare(ts, js), 0);
});
