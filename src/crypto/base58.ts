/**
 * Byte-identical port of base58Decode() from scripts/sign-sth.js.
 *
 * This implementation does NOT preserve leading-zero-byte runs the way
 * canonical base58 requires (no count-and-prepend of leading '1' chars --
 * see src/crypto/README.md). That is a known, deliberately preserved
 * quirk, not a bug introduced here: it is safe today only because every
 * multibase value this repository decodes has a fixed 0xed multicodec
 * prefix byte, which can never be 0x00. Do not "fix" this without first
 * confirming nothing downstream depends on the current behavior.
 */

const BASE58BTC_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function decodeBase58(text: string): Buffer {
  let n = 0n;
  for (const c of text) {
    const i = BASE58BTC_ALPHABET.indexOf(c);
    if (i < 0) throw new Error(`base58: invalid char '${c}'`);
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  return Buffer.from(hex, 'hex');
}
