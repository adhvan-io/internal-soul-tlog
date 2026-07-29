/**
 * Byte-identical port of canonicalPayload() from scripts/sign-sth.js.
 * Both the authority signature and the witness signature cover exactly
 * these bytes -- this is the single highest-value protocol invariant in
 * the whole repository. Do not swap json-canonicalize for another library
 * or a hand-rolled equivalent: a different key-ordering or number-format
 * convention here silently breaks signature verification in both
 * directions. See src/crypto/README.md.
 */

import { canonicalize } from 'json-canonicalize';
import type { SignedTreeHead } from '../protocol/types.js';

export function canonicalPayloadBytes(sth: SignedTreeHead): Buffer {
  return Buffer.from(canonicalize(sth));
}
