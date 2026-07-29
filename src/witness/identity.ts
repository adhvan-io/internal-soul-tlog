/**
 * Byte-identical port of extractAuthorityPublicKey() from
 * scripts/sign-sth.js. Protocol-selection logic (which encoding, which
 * array index) -- not pure cryptography, so it lives here rather than in
 * src/crypto/ (see src/crypto/README.md's "What's deliberately NOT here"
 * section, which named this exact function when it was deferred in Stage 3).
 *
 * The publicKeyMultibase branch delegates to crypto's parseMultibaseKey().
 * The publicKeyJwk branch -- deliberately deferred from Stage 3 -- is
 * implemented here: it's nothing more than decodeBase64url(x), with no
 * kty/crv/length validation, exactly matching current (insufficiently
 * validated) production behavior. See README.md.
 */

import type { IdentityDocument } from '../protocol/types.js';
import { parseMultibaseKey } from '../crypto/did.js';
import { decodeBase64url } from '../crypto/base64url.js';

export function resolveAuthorityPublicKey(identityDoc: IdentityDocument): Buffer {
  const vm = (identityDoc.verificationMethod ?? identityDoc.verificationMethods ?? [])[0];
  if (!vm) throw new Error('No verificationMethod in authority identity document');

  if ('publicKeyMultibase' in vm && vm.publicKeyMultibase) {
    return parseMultibaseKey(vm.publicKeyMultibase);
  }
  if ('publicKeyJwk' in vm && vm.publicKeyJwk?.x) {
    return decodeBase64url(vm.publicKeyJwk.x);
  }
  throw new Error('Unsupported verificationMethod format');
}
