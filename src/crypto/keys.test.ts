import test from 'node:test';
import assert from 'node:assert/strict';

import { importPrivateKey, importPublicKey } from './keys.js';
import { loadPrivateKey as loadPrivateKeyJs, rawBytesToPublicKey as rawBytesToPublicKeyJs } from '../../scripts/sign-sth.js';
import { decodeBase64url } from './base64url.js';
import { SYNTHETIC_AUTHORITY, SYNTHETIC_WITNESS } from '../../test/fixtures/synthetic.js';

test('keys: valid 32-byte private key imports as an Ed25519 key', () => {
  const key = importPrivateKey(decodeBase64url(SYNTHETIC_WITNESS.privateKeyB64url));
  assert.equal(key.asymmetricKeyType, 'ed25519');
});

test('keys: non-32-byte private key is rejected', () => {
  assert.throws(() => importPrivateKey(Buffer.from([1, 2, 3])), /Expected 32-byte private key, got 3/);
});

test('keys: public key imports as an Ed25519 key', () => {
  const key = importPublicKey(decodeBase64url(SYNTHETIC_AUTHORITY.publicKeyB64url));
  assert.equal(key.asymmetricKeyType, 'ed25519');
});

// Cross-implementation parity: TypeScript vs. the live JavaScript implementation.
// Compares the actual exported DER bytes, not just "both claim ed25519" --
// this proves the two implementations produce identical key material, not
// just similarly-typed KeyObjects.
test('parity: importPrivateKey produces byte-identical PKCS8 DER to JS loadPrivateKey', () => {
  const raw = decodeBase64url(SYNTHETIC_WITNESS.privateKeyB64url);
  const ts = importPrivateKey(raw).export({ format: 'der', type: 'pkcs8' });
  const js = loadPrivateKeyJs(SYNTHETIC_WITNESS.privateKeyB64url).export({ format: 'der', type: 'pkcs8' });
  assert.equal(Buffer.compare(ts, js), 0);
});

test('parity: importPublicKey produces byte-identical SPKI DER to JS rawBytesToPublicKey', () => {
  const raw = decodeBase64url(SYNTHETIC_AUTHORITY.publicKeyB64url);
  const ts = importPublicKey(raw).export({ format: 'der', type: 'spki' });
  const js = rawBytesToPublicKeyJs(raw).export({ format: 'der', type: 'spki' });
  assert.equal(Buffer.compare(ts, js), 0);
});
