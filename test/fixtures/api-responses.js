'use strict';

/**
 * SYNTHETIC API response fixtures — not real SWALL API output.
 * Built from test/fixtures/synthetic.js. Used to drive the local mock HTTP
 * server in the orchestration tests (test/witness.orchestration.test.js) and
 * as literal request/response shapes in the unit tests.
 */

const {
  FIXED_STH,
  AUTHORITY_SIGNATURE,
  WITNESS_SIGNATURE,
  MULTIBASE_VERIFICATION_METHOD,
  JWK_VERIFICATION_METHOD,
  WITNESS_KEY_ID,
  WITNESSED_AT,
} = require('./synthetic');

// GET /swall/log/sth/latest — fresh, not yet witnessed.
const LATEST_STH_RESPONSE_FRESH = Object.freeze({
  sth: FIXED_STH,
  signature: AUTHORITY_SIGNATURE,
});

// GET /swall/log/sth/latest — already witnessed (top-of-flow idempotency path).
const LATEST_STH_RESPONSE_ALREADY_COSIGNED = Object.freeze({
  sth: FIXED_STH,
  signature: AUTHORITY_SIGNATURE,
  witnessSignature: WITNESS_SIGNATURE,
  witnessKeyId: WITNESS_KEY_ID,
  witnessedAt: WITNESSED_AT,
});

// GET /.well-known/swall.json — multibase-encoded authority key.
const IDENTITY_DOCUMENT_MULTIBASE = Object.freeze({
  verificationMethod: [MULTIBASE_VERIFICATION_METHOD],
});

// GET /.well-known/swall.json — JWK-encoded authority key.
const IDENTITY_DOCUMENT_JWK = Object.freeze({
  verificationMethod: [JWK_VERIFICATION_METHOD],
});

// GET /.well-known/swall.json — unsupported verificationMethod shape.
const IDENTITY_DOCUMENT_UNSUPPORTED_METHOD = Object.freeze({
  verificationMethod: [{ id: 'key-1', type: 'SomeOtherKeyType2024' }],
});

// GET /.well-known/swall.json — multibase key too short to contain a
// multicodec prefix + 32-byte key (decodes to < 34 bytes).
const IDENTITY_DOCUMENT_MALFORMED_MULTIBASE = Object.freeze({
  verificationMethod: [{ publicKeyMultibase: 'z1' }],
});

// GET /.well-known/swall.json — JWK key present but wrong byte length.
// Current behavior: extractAuthorityPublicKey does NOT reject this (no
// length check on the JWK path) — it fails later, uncaught, inside
// rawBytesToPublicKey. See test/witness.security-baseline.test.js.
const IDENTITY_DOCUMENT_MALFORMED_JWK = Object.freeze({
  verificationMethod: [{ publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'AA' } }],
});

// POST /swall/log/sth/witness — normal success response.
const WITNESS_POST_RESPONSE_SUCCESS = Object.freeze({
  treeSize: FIXED_STH.treeSize,
  witnessedAt: WITNESSED_AT,
});

// POST /swall/log/sth/witness — race-condition response (another run
// co-signed between our verify step and our POST).
const WITNESS_POST_RESPONSE_RACE = Object.freeze({
  alreadyCosigned: true,
  treeSize: FIXED_STH.treeSize,
  witnessedAt: WITNESSED_AT,
});

// GET /swall/log/sth/latest — missing `sth` entirely.
const LATEST_STH_RESPONSE_MISSING_STH = Object.freeze({
  signature: AUTHORITY_SIGNATURE,
});

// GET /swall/log/sth/latest — missing `signature` entirely.
const LATEST_STH_RESPONSE_MISSING_SIGNATURE = Object.freeze({
  sth: FIXED_STH,
});

// sth with timestamp field entirely absent — current behavior: archive-path
// derivation throws an uncaught TypeError (not routed through fatal()).
const STH_MISSING_TIMESTAMP = Object.freeze({
  root: FIXED_STH.root,
  treeSize: FIXED_STH.treeSize,
  nodeId: FIXED_STH.nodeId,
});

// sth with a timestamp that has no 'T' separator — current behavior: no
// crash, but the whole string is silently used as the date-folder name.
const STH_MALFORMED_TIMESTAMP_NO_T = Object.freeze({
  ...FIXED_STH,
  timestamp: '20200101',
});

// sth with a non-numeric treeSize — current behavior: no crash, the value
// is interpolated as-is into the archive filename.
const STH_MALFORMED_TREESIZE = Object.freeze({
  ...FIXED_STH,
  treeSize: 'not-a-number',
});

module.exports = {
  LATEST_STH_RESPONSE_FRESH,
  LATEST_STH_RESPONSE_ALREADY_COSIGNED,
  IDENTITY_DOCUMENT_MULTIBASE,
  IDENTITY_DOCUMENT_JWK,
  IDENTITY_DOCUMENT_UNSUPPORTED_METHOD,
  IDENTITY_DOCUMENT_MALFORMED_MULTIBASE,
  IDENTITY_DOCUMENT_MALFORMED_JWK,
  WITNESS_POST_RESPONSE_SUCCESS,
  WITNESS_POST_RESPONSE_RACE,
  LATEST_STH_RESPONSE_MISSING_STH,
  LATEST_STH_RESPONSE_MISSING_SIGNATURE,
  STH_MISSING_TIMESTAMP,
  STH_MALFORMED_TIMESTAMP_NO_T,
  STH_MALFORMED_TREESIZE,
};
