/**
 * Byte-identical port of archivePathFor() from scripts/sign-sth.js. Pure:
 * given the same (sth, repoRoot), always produces the same path, no I/O.
 *
 * Deliberately preserves two known quirks rather than fixing them (Stage 0
 * remains authoritative -- see test/witness.unit.test.js's DEFECT-labeled
 * tests):
 *   - a timestamp with no 'T' separator silently produces the whole string
 *     as the date folder name, instead of failing;
 *   - treeSize is interpolated as-is with no validation.
 * A genuinely missing/non-string timestamp still throws the same way
 * calling .split() on a non-string does in JavaScript -- SignedTreeHead's
 * `timestamp: string` type documents the contract, it doesn't change what
 * happens when a real value violates it at runtime.
 */

import * as path from 'node:path';
import type { SignedTreeHead } from '../protocol/types.js';

export function archivePathFor(sth: SignedTreeHead, repoRoot: string): string {
  // String.split() on a string always yields at least one element -- the
  // `= ''` default is structurally unreachable, present only to satisfy
  // noUncheckedIndexedAccess without an `as`/`!` assertion.
  const [dateStr = ''] = sth.timestamp.split('T');
  return path.join(repoRoot, 'sth', dateStr, `${sth.treeSize}.json`);
}
