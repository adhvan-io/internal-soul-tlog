import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMultibaseKey } from './did.js';
import { extractAuthorityPublicKey as extractAuthorityPublicKeyJs } from '../../scripts/sign-sth.js';
import { decodeBase64url } from './base64url.js';
import { MULTIBASE_VERIFICATION_METHOD, SYNTHETIC_AUTHORITY } from '../../test/fixtures/synthetic.js';
import { IDENTITY_DOCUMENT_MALFORMED_MULTIBASE } from '../../test/fixtures/api-responses.js';

test('did: parses the fixed multibase fixture to the authority public key', () => {
  const raw = parseMultibaseKey(MULTIBASE_VERIFICATION_METHOD.publicKeyMultibase);
  assert.deepEqual(raw, decodeBase64url(SYNTHETIC_AUTHORITY.publicKeyB64url));
});

test('did: malformed (too-short) multibase key is rejected', () => {
  assert.throws(() => parseMultibaseKey('z1'), /Unexpected multibase key length/);
});

// Cross-implementation parity: TypeScript vs. the live JavaScript implementation.
test('parity: parseMultibaseKey matches JS extractAuthorityPublicKey for the multibase branch', () => {
  const ts = parseMultibaseKey(MULTIBASE_VERIFICATION_METHOD.publicKeyMultibase);
  const js = extractAuthorityPublicKeyJs({ verificationMethod: [MULTIBASE_VERIFICATION_METHOD] });
  assert.equal(Buffer.compare(ts, js), 0);
});

test('parity: both implementations reject the same malformed multibase fixture', () => {
  const badMultibase = (IDENTITY_DOCUMENT_MALFORMED_MULTIBASE as { verificationMethod: [{ publicKeyMultibase: string }] })
    .verificationMethod[0].publicKeyMultibase;
  assert.throws(() => parseMultibaseKey(badMultibase));
  assert.throws(() => extractAuthorityPublicKeyJs(IDENTITY_DOCUMENT_MALFORMED_MULTIBASE));
});
