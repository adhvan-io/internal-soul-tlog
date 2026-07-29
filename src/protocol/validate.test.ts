/**
 * Tests for src/protocol/validate.ts. Reuses the Stage 0 JavaScript
 * fixtures (test/fixtures/) rather than duplicating fixture data — see the
 * .d.ts declarations alongside those fixture modules.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isSignedTreeHead,
  parseLatestSTHResponse,
  isMultibaseVerificationMethod,
  isJwkVerificationMethod,
  isVerificationMethod,
  isIdentityDocument,
  parseIdentityDocument,
  isWitnessPostResponse,
  parseWitnessPostResponse,
} from './validate.js';

import {
  MULTIBASE_VERIFICATION_METHOD,
  JWK_VERIFICATION_METHOD,
} from '../../test/fixtures/synthetic.js';

import {
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
  STH_MALFORMED_TREESIZE,
} from '../../test/fixtures/api-responses.js';

// ── Valid fixtures ───────────────────────────────────────────────────────

test('valid: multibase verification method', () => {
  assert.equal(isMultibaseVerificationMethod(MULTIBASE_VERIFICATION_METHOD), true);
  assert.equal(isVerificationMethod(MULTIBASE_VERIFICATION_METHOD), true);
});

test('valid: JWK verification method', () => {
  assert.equal(isJwkVerificationMethod(JWK_VERIFICATION_METHOD), true);
  assert.equal(isVerificationMethod(JWK_VERIFICATION_METHOD), true);
});

test('valid: fresh (unwitnessed) latest STH response', () => {
  const parsed = parseLatestSTHResponse(LATEST_STH_RESPONSE_FRESH);
  assert.equal('witnessSignature' in parsed, false);
});

test('valid: already-cosigned latest STH response', () => {
  const parsed = parseLatestSTHResponse(LATEST_STH_RESPONSE_ALREADY_COSIGNED);
  assert.equal('witnessSignature' in parsed, true);
});

test('valid: identity document with multibase method', () => {
  assert.equal(isIdentityDocument(IDENTITY_DOCUMENT_MULTIBASE), true);
  assert.doesNotThrow(() => parseIdentityDocument(IDENTITY_DOCUMENT_MULTIBASE));
});

test('valid: identity document with JWK method', () => {
  assert.equal(isIdentityDocument(IDENTITY_DOCUMENT_JWK), true);
  assert.doesNotThrow(() => parseIdentityDocument(IDENTITY_DOCUMENT_JWK));
});

test('valid: witness POST success response', () => {
  assert.equal(isWitnessPostResponse(WITNESS_POST_RESPONSE_SUCCESS), true);
  assert.doesNotThrow(() => parseWitnessPostResponse(WITNESS_POST_RESPONSE_SUCCESS));
});

test('valid: witness POST already-cosigned (race) response', () => {
  assert.equal(isWitnessPostResponse(WITNESS_POST_RESPONSE_RACE), true);
  const parsed = parseWitnessPostResponse(WITNESS_POST_RESPONSE_RACE);
  assert.equal(parsed.alreadyCosigned, true);
});

// ── Invalid fixtures: missing fields ────────────────────────────────────

test('invalid: missing sth is rejected', () => {
  assert.throws(() => parseLatestSTHResponse(LATEST_STH_RESPONSE_MISSING_STH));
});

test('invalid: missing signature is rejected', () => {
  assert.throws(() => parseLatestSTHResponse(LATEST_STH_RESPONSE_MISSING_SIGNATURE));
});

// ── Invalid fixtures: wrong primitive types ─────────────────────────────

test('invalid: non-numeric treeSize is rejected by isSignedTreeHead', () => {
  assert.equal(isSignedTreeHead(STH_MALFORMED_TREESIZE), false);
});

test('invalid: wrong primitive type in witness POST response is rejected', () => {
  assert.equal(isWitnessPostResponse({ alreadyCosigned: 'yes' }), false);
  assert.equal(isWitnessPostResponse({ treeSize: '42' }), false);
  assert.equal(isWitnessPostResponse({ witnessedAt: 12345 }), false);
});

// ── Invalid fixtures: malformed union ───────────────────────────────────

test('invalid: verificationMethod matching neither multibase nor JWK shape is rejected', () => {
  assert.equal(isVerificationMethod({ id: 'key-1', type: 'SomeOtherKeyType2024' }), false);
  assert.equal(isIdentityDocument(IDENTITY_DOCUMENT_UNSUPPORTED_METHOD), false);
});

// ── Invalid fixtures: missing / empty verificationMethod ────────────────

test('invalid: identity document with no verificationMethod field at all is rejected', () => {
  assert.equal(isIdentityDocument({}), false);
});

test('invalid: identity document with an empty verificationMethod array is rejected', () => {
  assert.equal(isIdentityDocument({ verificationMethod: [] }), false);
});

// ── Deliberate scope boundary: shape-valid but cryptographically bogus ──
// These prove the validator's actual boundary, per src/protocol/README.md:
// it checks JSON shape only. A too-short base58 or JWK key still "looks
// like" a verification method at this layer -- rejecting it is the job of
// extractAuthorityPublicKey()'s base58 decode / key-construction step in
// the JavaScript implementation, not this validator.

test('boundary: shape-valid multibase method with a cryptographically too-short key still passes shape validation', () => {
  assert.equal(isIdentityDocument(IDENTITY_DOCUMENT_MALFORMED_MULTIBASE), true);
});

test('boundary: shape-valid JWK method with a cryptographically too-short key still passes shape validation', () => {
  assert.equal(isIdentityDocument(IDENTITY_DOCUMENT_MALFORMED_JWK), true);
});
