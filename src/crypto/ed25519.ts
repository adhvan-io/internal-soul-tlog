/**
 * Byte-identical port of the inline sign/verify calls in
 * scripts/sign-sth.js's main flow. `algorithm: null` is required for pure
 * Ed25519 (PureEdDSA) -- passing anything else (e.g. 'sha512') would be a
 * different, incompatible scheme. That detail is a protocol/security
 * invariant, encapsulated here rather than left as a magic argument at
 * every call site.
 */

import { sign as cryptoSign, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { encodeBase64url, decodeBase64url } from './base64url.js';

/** Signs payload with privateKey, returning the base64url (no padding) signature. */
export function signPayload(payload: Buffer, privateKey: KeyObject): string {
  return encodeBase64url(cryptoSign(null, payload, privateKey));
}

/** Verifies a base64url (no padding) signature over payload against publicKey. */
export function verifySignature(payload: Buffer, publicKey: KeyObject, signatureB64url: string): boolean {
  return cryptoVerify(null, payload, publicKey, decodeBase64url(signatureB64url));
}
