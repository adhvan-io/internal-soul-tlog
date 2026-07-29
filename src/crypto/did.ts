/**
 * Byte-identical port of the publicKeyMultibase branch of
 * extractAuthorityPublicKey() in scripts/sign-sth.js. Knows the DID
 * multibase-key convention (base58btc, 'z' prefix, 2-byte multicodec
 * prefix) -- distinct from decodeBase58() itself, which is a generic
 * base-58 decoder with no multicodec knowledge.
 *
 * Does not resolve which encoding a VerificationMethod uses (multibase vs.
 * JWK), and does not read a full IdentityDocument -- that array/union
 * resolution stays in scripts/sign-sth.js's extractAuthorityPublicKey()
 * this stage; it is protocol-resolution logic, not pure cryptography.
 * See src/crypto/README.md.
 */

import { decodeBase58 } from './base58.js';

const ED25519_MULTICODEC_PREFIX_LENGTH = 2; // 0xed 0x01
const ED25519_KEY_LENGTH = 32;

/**
 * Given a full publicKeyMultibase value (e.g. "z6Mk..."), strips the 'z'
 * prefix, base58-decodes, and strips the 2-byte Ed25519 multicodec prefix,
 * returning the raw 32-byte public key.
 */
export function parseMultibaseKey(multibase: string): Buffer {
  const decoded = decodeBase58(multibase.slice(1)); // strip 'z' prefix
  if (decoded.length < ED25519_MULTICODEC_PREFIX_LENGTH + ED25519_KEY_LENGTH) {
    throw new Error('Unexpected multibase key length');
  }
  return decoded.subarray(ED25519_MULTICODEC_PREFIX_LENGTH);
}
