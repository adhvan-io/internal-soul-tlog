/**
 * Type declaration for scripts/sign-sth.js's exported pure helpers.
 * Describes shape only — the production implementation is untouched.
 * Exists so Stage 3's cross-implementation parity tests can call the real
 * JavaScript functions directly and compare their output byte-for-byte
 * against the new TypeScript src/crypto/ implementation.
 */
import type { KeyObject } from 'node:crypto';

export function fromB64url(s: string): Buffer;
export function toB64url(b: Uint8Array | Buffer): string;
export function base58Decode(str: string): Buffer;
export function loadPrivateKey(b64url: string): KeyObject;
export function rawBytesToPublicKey(raw32: Uint8Array | Buffer): KeyObject;
export function extractAuthorityPublicKey(identityDoc: unknown): Buffer;
export function canonicalPayload(sth: unknown): Buffer;
export function archivePathFor(sth: unknown, repoRoot: string): string;
export function updateArchive(
  sth: unknown,
  witnessSignature: string,
  witnessKeyId: string,
  witnessedAt: string,
  repoRoot?: string
): void;
