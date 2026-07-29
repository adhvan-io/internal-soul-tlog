/**
 * Byte-identical port of loadPrivateKey() and rawBytesToPublicKey() from
 * scripts/sign-sth.js. Named keys.ts rather than the originally suggested
 * spki.ts: both functions are the same operation in each direction (wrap
 * raw Ed25519 key bytes in the standard fixed ASN.1 prefix for their key
 * type -- PKCS8 for private, SPKI for public) and neither is substantial
 * enough on its own to justify a separate file. See src/crypto/README.md
 * for why this merge was made.
 *
 * The two DER prefixes below are the standard, fixed ASN.1 encodings for
 * raw Ed25519 keys (OID 1.3.101.112) -- protocol invariants, not
 * incidental values. They must never change.
 */

import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_KEY_LENGTH = 32;

export function importPrivateKey(raw32: Uint8Array | Buffer): KeyObject {
  const raw = Buffer.from(raw32);
  if (raw.length !== ED25519_KEY_LENGTH) {
    throw new Error(`Expected 32-byte private key, got ${raw.length}`);
  }
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: 'der', type: 'pkcs8' });
}

export function importPublicKey(raw32: Uint8Array | Buffer): KeyObject {
  return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(raw32)]), format: 'der', type: 'spki' });
}
