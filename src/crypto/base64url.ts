/**
 * Byte-identical port of fromB64url()/toB64url() from scripts/sign-sth.js.
 * Every signature and raw key in this repository's protocol is
 * base64url-encoded, no padding.
 */

export function encodeBase64url(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function decodeBase64url(text: string): Buffer {
  return Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
