/**
 * Handwritten runtime validators: unknown -> type guard -> typed protocol
 * object. No external libraries. These check JSON *shape* only — the same
 * scope scripts/sign-sth.js's own existing checks cover (presence, primitive
 * types, which union variant). They deliberately do NOT validate Ed25519 key
 * contents, base58 correctness, signatures, or canonicalization: those stay
 * runtime responsibilities of the JavaScript implementation until a later
 * stage migrates them. See src/protocol/README.md for the full trust
 * boundary this module sits at.
 */

import type {
  SignedTreeHead,
  UnwitnessedRecord,
  WitnessedRecord,
  LatestSTHResponse,
  MultibaseVerificationMethod,
  JwkVerificationMethod,
  VerificationMethod,
  IdentityDocument,
  WitnessPostResponse,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSignedTreeHead(value: unknown): value is SignedTreeHead {
  return (
    isRecord(value) &&
    typeof value.root === 'string' &&
    typeof value.treeSize === 'number' &&
    typeof value.timestamp === 'string' &&
    typeof value.nodeId === 'string'
  );
}

export function parseSignedTreeHead(value: unknown): SignedTreeHead {
  if (!isSignedTreeHead(value)) {
    throw new Error(
      'Invalid SignedTreeHead: expected { root: string, treeSize: number, timestamp: string, nodeId: string }'
    );
  }
  return value;
}

export function isUnwitnessedRecord(value: unknown): value is UnwitnessedRecord {
  return isRecord(value) && isSignedTreeHead(value.sth) && typeof value.signature === 'string';
}

export function isWitnessedRecord(value: unknown): value is WitnessedRecord {
  return (
    isRecord(value) &&
    isSignedTreeHead(value.sth) &&
    typeof value.signature === 'string' &&
    typeof value.witnessSignature === 'string' &&
    typeof value.witnessKeyId === 'string' &&
    typeof value.witnessedAt === 'string'
  );
}

/**
 * Checks the witnessed shape first: a witnessed record also satisfies every
 * check isUnwitnessedRecord makes (it has sth + signature too), so the more
 * complete shape must be tried first for the discrimination to be correct.
 */
export function parseLatestSTHResponse(value: unknown): LatestSTHResponse {
  if (isWitnessedRecord(value)) return value;
  if (isUnwitnessedRecord(value)) return value;
  throw new Error(
    'Invalid latest STH response: does not match the unwitnessed ({ sth, signature }) or witnessed ({ sth, signature, witnessSignature, witnessKeyId, witnessedAt }) shape'
  );
}

export function isMultibaseVerificationMethod(value: unknown): value is MultibaseVerificationMethod {
  return isRecord(value) && typeof value.publicKeyMultibase === 'string';
}

export function isJwkVerificationMethod(value: unknown): value is JwkVerificationMethod {
  return isRecord(value) && isRecord(value.publicKeyJwk) && typeof value.publicKeyJwk.x === 'string';
}

export function isVerificationMethod(value: unknown): value is VerificationMethod {
  return isMultibaseVerificationMethod(value) || isJwkVerificationMethod(value);
}

/**
 * Only validates the first array entry (methods[0]), deliberately mirroring
 * extractAuthorityPublicKey() in scripts/sign-sth.js, which only ever reads
 * index 0 and never inspects the rest of the array. Requiring every entry
 * to be well-formed would validate more strictly than the current
 * implementation actually behaves.
 */
export function isIdentityDocument(value: unknown): value is IdentityDocument {
  if (!isRecord(value)) return false;
  const methods = value.verificationMethod ?? value.verificationMethods;
  return Array.isArray(methods) && methods.length > 0 && isVerificationMethod(methods[0]);
}

export function parseIdentityDocument(value: unknown): IdentityDocument {
  if (!isIdentityDocument(value)) {
    throw new Error(
      'Invalid identity document: expected a non-empty verificationMethod (or verificationMethods) array whose first entry is a multibase- or JWK-encoded key'
    );
  }
  return value;
}

export function isWitnessPostResponse(value: unknown): value is WitnessPostResponse {
  if (!isRecord(value)) return false;
  if ('alreadyCosigned' in value && typeof value.alreadyCosigned !== 'boolean') return false;
  if ('treeSize' in value && typeof value.treeSize !== 'number') return false;
  if ('witnessedAt' in value && typeof value.witnessedAt !== 'string') return false;
  return true;
}

export function parseWitnessPostResponse(value: unknown): WitnessPostResponse {
  if (!isWitnessPostResponse(value)) {
    throw new Error(
      'Invalid witness POST response: alreadyCosigned must be boolean, treeSize must be number, and witnessedAt must be string, when present'
    );
  }
  return value;
}
