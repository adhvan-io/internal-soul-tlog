/**
 * Fork and rollback protection for the witness (audit G6). The witness keeps
 * the last tree head it co-signed in the archive (sth/witness-state.json) and
 * co-signs a new head only if it extends that one:
 *
 *   smaller tree            refuse (rollback)
 *   same size, other root   refuse (fork)
 *   larger tree             the log's leaves must rebuild both the old root and
 *                           the new root (consistency), else refuse
 *
 * With no state yet (first run) the head is accepted and recorded: trust on
 * first use, stated in the outcome.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { merkleRoot } from '../protocol/merkle.js';
import type { SignedTreeHead } from '../protocol/types.js';

export interface WitnessState {
  treeSize: number;
  root: string;
  witnessedAt: string;
}

export type ContinuityDecision = { ok: true; reason: string } | { ok: false; reason: string };

export function witnessStatePath(repoRoot: string): string {
  return path.join(repoRoot, 'sth', 'witness-state.json');
}

export function readWitnessState(repoRoot: string): WitnessState | null {
  const file = witnessStatePath(repoRoot);
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<WitnessState>;
  if (!Number.isInteger(parsed.treeSize) || typeof parsed.root !== 'string' || typeof parsed.witnessedAt !== 'string') {
    // A corrupt state file must stop the witness, not reset it to trust-on-first-use.
    throw new Error(`Witness state ${file} is malformed — refusing to continue`);
  }
  return parsed as WitnessState;
}

export function writeWitnessState(repoRoot: string, state: WitnessState): void {
  const file = witnessStatePath(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

/** Whether the witness needs the log's leaves to decide (a larger tree than the last one signed). */
export function needsConsistency(prev: WitnessState | null, next: SignedTreeHead): prev is WitnessState {
  return prev !== null && next.treeSize > prev.treeSize;
}

export function checkContinuity(prev: WitnessState | null, next: SignedTreeHead, leafHashes?: readonly string[]): ContinuityDecision {
  if (prev === null) return { ok: true, reason: 'no previous head (trust on first use)' };
  if (next.treeSize < prev.treeSize) {
    return { ok: false, reason: `rollback: treeSize ${next.treeSize} is smaller than the last co-signed ${prev.treeSize}` };
  }
  if (next.treeSize === prev.treeSize) {
    return next.root === prev.root
      ? { ok: true, reason: 'same head as last co-signed' }
      : { ok: false, reason: `fork: treeSize ${next.treeSize} has root ${next.root.slice(0, 16)}… but the co-signed head had ${prev.root.slice(0, 16)}…` };
  }
  if (!leafHashes || leafHashes.length !== next.treeSize) {
    return { ok: false, reason: `consistency proof missing for ${prev.treeSize} → ${next.treeSize}` };
  }
  if (merkleRoot(leafHashes.slice(0, prev.treeSize)) !== prev.root) {
    return { ok: false, reason: `fork: the log's first ${prev.treeSize} leaves do not rebuild the co-signed root` };
  }
  if (merkleRoot(leafHashes) !== next.root) {
    return { ok: false, reason: `the log's ${next.treeSize} leaves do not rebuild the new root` };
  }
  return { ok: true, reason: `consistent with treeSize ${prev.treeSize}` };
}
