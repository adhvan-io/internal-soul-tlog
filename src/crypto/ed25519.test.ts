import test from 'node:test';
import assert from 'node:assert/strict';

import { signPayload, verifySignature } from './ed25519.js';
import { canonicalPayloadBytes } from './canonical.js';
import { importPrivateKey, importPublicKey } from './keys.js';
import { decodeBase64url } from './base64url.js';
import { extractAuthorityPublicKey as extractAuthorityPublicKeyJs } from '../../scripts/sign-sth.js';
import {
  FIXED_STH,
  SYNTHETIC_AUTHORITY,
  SYNTHETIC_WITNESS,
  AUTHORITY_SIGNATURE,
  INVALID_AUTHORITY_SIGNATURE,
  WITNESS_SIGNATURE,
  MULTIBASE_VERIFICATION_METHOD,
} from '../../test/fixtures/synthetic.js';

test('ed25519: valid authority signature verifies against the canonical payload', () => {
  const pubKey = importPublicKey(decodeBase64url(SYNTHETIC_AUTHORITY.publicKeyB64url));
  const payload = canonicalPayloadBytes(FIXED_STH);
  assert.equal(verifySignature(payload, pubKey, AUTHORITY_SIGNATURE), true);
});

test('ed25519: corrupted authority signature does not verify (fail-closed invariant)', () => {
  const pubKey = importPublicKey(decodeBase64url(SYNTHETIC_AUTHORITY.publicKeyB64url));
  const payload = canonicalPayloadBytes(FIXED_STH);
  assert.equal(verifySignature(payload, pubKey, INVALID_AUTHORITY_SIGNATURE), false);
});

test('ed25519: signPayload equals the exact expected witness signature fixture', () => {
  const privKey = importPrivateKey(decodeBase64url(SYNTHETIC_WITNESS.privateKeyB64url));
  const payload = canonicalPayloadBytes(FIXED_STH);
  assert.equal(signPayload(payload, privKey), WITNESS_SIGNATURE);
});

test('ed25519: signing and verifying use the same canonical payload bytes', () => {
  const authorityPubKey = importPublicKey(decodeBase64url(SYNTHETIC_AUTHORITY.publicKeyB64url));
  const witnessPubKey = importPublicKey(decodeBase64url(SYNTHETIC_WITNESS.publicKeyB64url));
  const payload = canonicalPayloadBytes(FIXED_STH);
  assert.equal(verifySignature(payload, authorityPubKey, AUTHORITY_SIGNATURE), true);
  assert.equal(verifySignature(payload, witnessPubKey, WITNESS_SIGNATURE), true);
});

// Cross-implementation parity / integration: the raw key bytes come from
// the live JS extractAuthorityPublicKey(), then get imported and verified
// entirely by the new TypeScript module -- proving the two implementations
// compose correctly, not just that each one works in isolation.
test('parity: JS key resolution + TS import + TS verify all agree on the real authority signature', () => {
  const rawKey = extractAuthorityPublicKeyJs({ verificationMethod: [MULTIBASE_VERIFICATION_METHOD] });
  const pubKey = importPublicKey(rawKey);
  const payload = canonicalPayloadBytes(FIXED_STH);
  assert.equal(verifySignature(payload, pubKey, AUTHORITY_SIGNATURE), true);
});
