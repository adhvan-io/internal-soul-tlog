/**
 * Type declaration for synthetic.js — describes shape only, no fixture
 * values are duplicated here. See src/protocol/README.md for why the
 * TypeScript validator tests need this alongside the existing Stage 0
 * JavaScript fixtures rather than a separate set of TS-only fixtures.
 */
import type { SignedTreeHead, MultibaseVerificationMethod, JwkVerificationMethod } from '../../src/protocol/types.js';

export const FIXED_STH: SignedTreeHead;
export const CANONICAL_PAYLOAD_STRING: string;
export const CANONICAL_PAYLOAD_HEX: string;
export const SYNTHETIC_AUTHORITY: { privateKeyB64url: string; publicKeyB64url: string };
export const SYNTHETIC_WITNESS: { privateKeyB64url: string; publicKeyB64url: string };
export const AUTHORITY_SIGNATURE: string;
export const INVALID_AUTHORITY_SIGNATURE: string;
export const WITNESS_SIGNATURE: string;
export const MULTIBASE_VERIFICATION_METHOD: MultibaseVerificationMethod;
export const JWK_VERIFICATION_METHOD: JwkVerificationMethod;
export const WITNESS_KEY_ID: string;
export const WITNESSED_AT: string;
