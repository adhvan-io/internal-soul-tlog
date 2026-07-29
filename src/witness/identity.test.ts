import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAuthorityPublicKey } from './identity.js';
import { extractAuthorityPublicKey as extractAuthorityPublicKeyJs } from '../../scripts/sign-sth.js';
import { decodeBase64url } from '../crypto/base64url.js';
import { MULTIBASE_VERIFICATION_METHOD, JWK_VERIFICATION_METHOD, SYNTHETIC_AUTHORITY } from '../../test/fixtures/synthetic.js';
import {
  IDENTITY_DOCUMENT_MULTIBASE,
  IDENTITY_DOCUMENT_JWK,
  IDENTITY_DOCUMENT_UNSUPPORTED_METHOD,
  IDENTITY_DOCUMENT_MALFORMED_MULTIBASE,
  IDENTITY_DOCUMENT_MALFORMED_JWK,
} from '../../test/fixtures/api-responses.js';
import type { IdentityDocument } from '../protocol/types.js';

test('identity: resolves the multibase-encoded authority key', () => {
  const raw = resolveAuthorityPublicKey(IDENTITY_DOCUMENT_MULTIBASE);
  assert.equal(raw.toString('base64url'), decodeBase64url(SYNTHETIC_AUTHORITY.publicKeyB64url).toString('base64url'));
});

test('identity: resolves the JWK-encoded authority key (implements the branch deferred from Stage 3)', () => {
  const raw = resolveAuthorityPublicKey(IDENTITY_DOCUMENT_JWK);
  assert.deepEqual(raw, decodeBase64url(SYNTHETIC_AUTHORITY.publicKeyB64url));
});

test('identity: verificationMethods (plural) key name is also accepted', () => {
  const doc = { verificationMethods: [MULTIBASE_VERIFICATION_METHOD] } as IdentityDocument;
  const raw = resolveAuthorityPublicKey(doc);
  assert.deepEqual(raw, decodeBase64url(SYNTHETIC_AUTHORITY.publicKeyB64url));
});

test('identity: no verificationMethod at all is rejected', () => {
  assert.throws(() => resolveAuthorityPublicKey({} as IdentityDocument), /No verificationMethod in authority identity document/);
});

test('identity: unsupported verificationMethod format is rejected', () => {
  assert.throws(
    () => resolveAuthorityPublicKey(IDENTITY_DOCUMENT_UNSUPPORTED_METHOD as IdentityDocument),
    /Unsupported verificationMethod format/
  );
});

test('identity: malformed (too-short) multibase key is rejected', () => {
  assert.throws(
    () => resolveAuthorityPublicKey(IDENTITY_DOCUMENT_MALFORMED_MULTIBASE as IdentityDocument),
    /Unexpected multibase key length/
  );
});

test('identity: DEFECT (documented, not fixed) -- malformed JWK key length is not validated here either', () => {
  // No kty/crv/length check, exactly matching current production behavior
  // and Stage 2's JwkVerificationMethod type (only `x` is modeled).
  const raw = resolveAuthorityPublicKey(IDENTITY_DOCUMENT_MALFORMED_JWK as IdentityDocument);
  assert.equal(raw.length, 1);
});

// Cross-implementation parity: TypeScript vs. the live JavaScript implementation.

test('parity: resolveAuthorityPublicKey matches JS extractAuthorityPublicKey for both encodings', () => {
  for (const doc of [IDENTITY_DOCUMENT_MULTIBASE, IDENTITY_DOCUMENT_JWK]) {
    const ts = resolveAuthorityPublicKey(doc);
    const js = extractAuthorityPublicKeyJs(doc);
    assert.equal(Buffer.compare(ts, js), 0);
  }
});

test('parity: both implementations reject the same malformed fixtures', () => {
  for (const doc of [IDENTITY_DOCUMENT_UNSUPPORTED_METHOD, IDENTITY_DOCUMENT_MALFORMED_MULTIBASE]) {
    assert.throws(() => resolveAuthorityPublicKey(doc as IdentityDocument));
    assert.throws(() => extractAuthorityPublicKeyJs(doc));
  }
});
