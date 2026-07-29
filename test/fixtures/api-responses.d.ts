/**
 * Type declaration for api-responses.js — describes shape only, no fixture
 * values are duplicated here. Deliberately malformed fixtures are typed
 * `unknown`: from a validator's perspective that's exactly what they are
 * until (and unless) validation says otherwise.
 */
import type { LatestSTHResponse, IdentityDocument, WitnessPostResponse } from '../../src/protocol/types.js';

export const LATEST_STH_RESPONSE_FRESH: LatestSTHResponse;
export const LATEST_STH_RESPONSE_ALREADY_COSIGNED: LatestSTHResponse;
export const IDENTITY_DOCUMENT_MULTIBASE: IdentityDocument;
export const IDENTITY_DOCUMENT_JWK: IdentityDocument;
export const IDENTITY_DOCUMENT_UNSUPPORTED_METHOD: unknown;
export const IDENTITY_DOCUMENT_MALFORMED_MULTIBASE: unknown;
export const IDENTITY_DOCUMENT_MALFORMED_JWK: unknown;
export const WITNESS_POST_RESPONSE_SUCCESS: WitnessPostResponse;
export const WITNESS_POST_RESPONSE_RACE: WitnessPostResponse;
export const LATEST_STH_RESPONSE_MISSING_STH: unknown;
export const LATEST_STH_RESPONSE_MISSING_SIGNATURE: unknown;
export const STH_MISSING_TIMESTAMP: unknown;
export const STH_MALFORMED_TIMESTAMP_NO_T: unknown;
export const STH_MALFORMED_TREESIZE: unknown;
