'use strict';

/**
 * Expected archive path and exact archive-file bytes for FIXED_STH, matching
 * the shape actually written to sth/{YYYY-MM-DD}/{treeSize}.json by
 * scripts/sign-sth.js (2-space indent, trailing newline, field order
 * sth -> signature -> witnessSignature -> witnessKeyId -> witnessedAt).
 */

const {
  FIXED_STH,
  AUTHORITY_SIGNATURE,
  WITNESS_SIGNATURE,
  WITNESS_KEY_ID,
  WITNESSED_AT,
} = require('./synthetic');

// Relative to a repo root, this is where the archive record for FIXED_STH lives.
const EXPECTED_ARCHIVE_RELATIVE_PATH = 'sth/2020-01-01/42.json';

// The record as if already committed by the SWALL API, before witnessing.
const UNWITNESSED_RECORD = { sth: FIXED_STH, signature: AUTHORITY_SIGNATURE };

// The exact bytes updateArchive() should read from an unwitnessed file.
const EXPECTED_ARCHIVE_JSON_UNWITNESSED = JSON.stringify(UNWITNESSED_RECORD, null, 2) + '\n';

// The record after updateArchive() adds the witness co-signature.
const WITNESSED_RECORD = {
  sth: FIXED_STH,
  signature: AUTHORITY_SIGNATURE,
  witnessSignature: WITNESS_SIGNATURE,
  witnessKeyId: WITNESS_KEY_ID,
  witnessedAt: WITNESSED_AT,
};

// The exact bytes updateArchive() must write once witnessing completes.
const EXPECTED_ARCHIVE_JSON_WITNESSED = JSON.stringify(WITNESSED_RECORD, null, 2) + '\n';

module.exports = {
  EXPECTED_ARCHIVE_RELATIVE_PATH,
  UNWITNESSED_RECORD,
  EXPECTED_ARCHIVE_JSON_UNWITNESSED,
  WITNESSED_RECORD,
  EXPECTED_ARCHIVE_JSON_WITNESSED,
};
