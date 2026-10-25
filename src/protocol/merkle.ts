/**
 * RFC 6962 Merkle Tree Hash over leaf hashes, matching the SWALL platform's
 * crypto/merkle.js computeRoot(): internal nodes are SHA-256(0x01 || left ||
 * right), an unpaired node is promoted unchanged, and the empty tree hashes to
 * SHA-256(""). Inputs are the log's leaf hashes (already SHA-256(0x00 || data)),
 * hex-encoded, in leaf order. Used to check that a new tree head extends the one
 * the witness last signed (audit G6).
 */

import { createHash } from 'node:crypto';

const INTERNAL_PREFIX = Buffer.from([0x01]);

export function merkleRoot(leafHashesHex: readonly string[]): string {
  if (leafHashesHex.length === 0) return createHash('sha256').update(Buffer.alloc(0)).digest('hex');
  let layer: Buffer[] = leafHashesHex.map((h) => Buffer.from(h, 'hex'));
  while (layer.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i] as Buffer;
      const right = layer[i + 1];
      next.push(right ? createHash('sha256').update(INTERNAL_PREFIX).update(left).update(right).digest() : left);
    }
    layer = next;
  }
  return (layer[0] as Buffer).toString('hex');
}

const HEX_HASH = /^[0-9a-f]{64}$/;

/** Parses GET /swall/log/consistency: every leaf hash up to `to` (the platform's current proof format). */
export function parseConsistencyResponse(value: unknown, from: number, to: number): string[] {
  const v = value as { from?: unknown; to?: unknown; leaf_hashes?: unknown } | null;
  if (!v || typeof v !== 'object' || v.from !== from || v.to !== to || !Array.isArray(v.leaf_hashes)) {
    throw new Error(`Malformed consistency response for from=${from} to=${to}`);
  }
  const leaves = v.leaf_hashes as unknown[];
  if (leaves.length !== to || !leaves.every((h) => typeof h === 'string' && HEX_HASH.test(h))) {
    throw new Error(`Consistency response for to=${to} must carry ${to} hex leaf hashes`);
  }
  return leaves as string[];
}
