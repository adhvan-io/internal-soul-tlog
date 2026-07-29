'use strict';

/**
 * Offline unit tests for the pure/exported helpers in scripts/sign-sth.js.
 * No network access, no production credentials, no real archive data.
 * See test/README.md for the purpose of this suite.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createPublicKey, verify: cryptoVerify } = require('node:crypto');

const witness = require('../scripts/sign-sth.js');
const {
  FIXED_STH,
  CANONICAL_PAYLOAD_STRING,
  CANONICAL_PAYLOAD_HEX,
  SYNTHETIC_AUTHORITY,
  SYNTHETIC_WITNESS,
  AUTHORITY_SIGNATURE,
  INVALID_AUTHORITY_SIGNATURE,
  WITNESS_SIGNATURE,
  MULTIBASE_VERIFICATION_METHOD,
  JWK_VERIFICATION_METHOD,
} = require('./fixtures/synthetic');
const {
  IDENTITY_DOCUMENT_UNSUPPORTED_METHOD,
  IDENTITY_DOCUMENT_MALFORMED_MULTIBASE,
  STH_MISSING_TIMESTAMP,
  STH_MALFORMED_TIMESTAMP_NO_T,
  STH_MALFORMED_TREESIZE,
} = require('./fixtures/api-responses');
const {
  EXPECTED_ARCHIVE_RELATIVE_PATH,
  UNWITNESSED_RECORD,
  EXPECTED_ARCHIVE_JSON_UNWITNESSED,
  WITNESSED_RECORD,
  EXPECTED_ARCHIVE_JSON_WITNESSED,
} = require('./fixtures/archive');

// ── Encoding ─────────────────────────────────────────────────────────────

test('encoding: base64url encode/decode round trip', () => {
  const raw = Buffer.from('hello world, this is a test payload!!');
  const encoded = witness.toB64url(raw);
  assert.equal(encoded.includes('+'), false);
  assert.equal(encoded.includes('/'), false);
  assert.equal(encoded.includes('='), false);
  assert.deepEqual(witness.fromB64url(encoded), raw);
});

test('encoding: toB64url strips padding', () => {
  // 1-byte input forces base64 padding ('==') that must be stripped.
  const encoded = witness.toB64url(Buffer.from([0x41]));
  assert.equal(encoded, 'QQ');
  assert.equal(encoded.includes('='), false);
});

test('encoding: base58Decode of the fixed multibase fixture matches the authority public key', () => {
  const decoded = witness.base58Decode(MULTIBASE_VERIFICATION_METHOD.publicKeyMultibase.slice(1));
  assert.equal(decoded.length, 34, 'multicodec prefix (2 bytes) + Ed25519 key (32 bytes)');
  assert.deepEqual(decoded.subarray(0, 2), Buffer.from([0xed, 0x01]), 'Ed25519 multicodec prefix');
  assert.equal(witness.toB64url(decoded.subarray(2)), SYNTHETIC_AUTHORITY.publicKeyB64url);
});

test('encoding: base58Decode current leading-byte behavior (documented, not fixed)', () => {
  // Current implementation does NOT preserve leading-zero-byte runs the way
  // canonical base58 requires (no count-and-prepend of leading '1' chars).
  // This is safe today only because every multibase value this script
  // decodes has a fixed 0xed multicodec prefix byte, which can never be
  // 0x00 -- so the truncation bug can't trigger in practice. Pinning it
  // here so a future encoder swap doesn't silently change this.
  const decoded = witness.base58Decode('1'); // '1' == 0 in base58btc
  assert.deepEqual(decoded, Buffer.from([0x00]));
});

test('encoding: base58Decode rejects invalid characters', () => {
  assert.throws(() => witness.base58Decode('0OIl'), /base58: invalid char/);
});

// ── Key handling ─────────────────────────────────────────────────────────

test('keys: valid 32-byte witness private key loads', () => {
  const key = witness.loadPrivateKey(SYNTHETIC_WITNESS.privateKeyB64url);
  assert.equal(key.asymmetricKeyType, 'ed25519');
});

test('keys: non-32-byte private key is rejected', () => {
  assert.throws(
    () => witness.loadPrivateKey(witness.toB64url(Buffer.from([1, 2, 3]))),
    /Expected 32-byte private key, got 3/
  );
});

test('keys: rawBytesToPublicKey produces a usable Ed25519 SPKI key', () => {
  const raw = witness.fromB64url(SYNTHETIC_AUTHORITY.publicKeyB64url);
  const key = witness.rawBytesToPublicKey(raw);
  assert.equal(key.asymmetricKeyType, 'ed25519');
  const payload = Buffer.from(CANONICAL_PAYLOAD_STRING);
  const ok = cryptoVerify(null, payload, key, witness.fromB64url(AUTHORITY_SIGNATURE));
  assert.equal(ok, true);
});

test('keys: multibase verification method resolves to the fixed authority public key', () => {
  const doc = { verificationMethod: [MULTIBASE_VERIFICATION_METHOD] };
  const raw = witness.extractAuthorityPublicKey(doc);
  assert.equal(witness.toB64url(raw), SYNTHETIC_AUTHORITY.publicKeyB64url);
});

test('keys: JWK verification method resolves to the same fixed authority public key', () => {
  const doc = { verificationMethod: [JWK_VERIFICATION_METHOD] };
  const raw = witness.extractAuthorityPublicKey(doc);
  assert.equal(witness.toB64url(raw), SYNTHETIC_AUTHORITY.publicKeyB64url);
});

test('keys: verificationMethods (plural) key name is also accepted', () => {
  const doc = { verificationMethods: [MULTIBASE_VERIFICATION_METHOD] };
  const raw = witness.extractAuthorityPublicKey(doc);
  assert.equal(witness.toB64url(raw), SYNTHETIC_AUTHORITY.publicKeyB64url);
});

test('keys: unsupported verificationMethod format fails', () => {
  assert.throws(
    () => witness.extractAuthorityPublicKey(IDENTITY_DOCUMENT_UNSUPPORTED_METHOD),
    /Unsupported verificationMethod format/
  );
});

test('keys: no verificationMethod at all fails', () => {
  assert.throws(
    () => witness.extractAuthorityPublicKey({}),
    /No verificationMethod in authority identity document/
  );
});

test('keys: malformed (too-short) multibase key is rejected by extractAuthorityPublicKey', () => {
  assert.throws(
    () => witness.extractAuthorityPublicKey(IDENTITY_DOCUMENT_MALFORMED_MULTIBASE),
    /Unexpected multibase key length/
  );
});

test('keys: DEFECT (documented, not fixed) — malformed JWK key length is not validated by extractAuthorityPublicKey', () => {
  // extractAuthorityPublicKey has no length check on the publicKeyJwk.x path
  // (unlike the multibase path's `< 34` check). A too-short key is returned
  // without error; the failure only surfaces later, inside
  // rawBytesToPublicKey, as a raw Node crypto error rather than a
  // '[witness] FATAL: Cannot parse authority public key: ...' message --
  // and in the real orchestration flow, that call sits OUTSIDE the
  // try/catch that wraps extractAuthorityPublicKey, so it is currently an
  // UNCAUGHT exception path, not a clean fatal(). See
  // test/witness.orchestration.test.js for the end-to-end version of this.
  const doc = { verificationMethod: [{ publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'AA' } }] };
  const raw = witness.extractAuthorityPublicKey(doc);
  assert.equal(raw.length, 1, 'no length validation on the JWK path today');
  assert.throws(() => witness.rawBytesToPublicKey(raw), /Failed to read asymmetric key/);
});

// ── Canonicalization and signatures ─────────────────────────────────────

test('canonicalization: exact canonical payload matches the frozen fixture', () => {
  const payload = witness.canonicalPayload(FIXED_STH);
  assert.equal(payload.toString('utf8'), CANONICAL_PAYLOAD_STRING);
  assert.equal(payload.toString('hex'), CANONICAL_PAYLOAD_HEX);
});

test('signatures: valid authority signature verifies against the canonical payload', () => {
  const pubKey = witness.rawBytesToPublicKey(witness.fromB64url(SYNTHETIC_AUTHORITY.publicKeyB64url));
  const payload = witness.canonicalPayload(FIXED_STH);
  const ok = cryptoVerify(null, payload, pubKey, witness.fromB64url(AUTHORITY_SIGNATURE));
  assert.equal(ok, true);
});

test('signatures: corrupted authority signature does not verify (fail-closed invariant)', () => {
  const pubKey = witness.rawBytesToPublicKey(witness.fromB64url(SYNTHETIC_AUTHORITY.publicKeyB64url));
  const payload = witness.canonicalPayload(FIXED_STH);
  const ok = cryptoVerify(null, payload, pubKey, witness.fromB64url(INVALID_AUTHORITY_SIGNATURE));
  assert.equal(ok, false);
});

test('signatures: witness signature equals the exact expected base64url fixture', () => {
  const { sign: cryptoSign } = require('node:crypto');
  const privKey = witness.loadPrivateKey(SYNTHETIC_WITNESS.privateKeyB64url);
  const payload = witness.canonicalPayload(FIXED_STH);
  const sigBuf = cryptoSign(null, payload, privKey);
  assert.equal(witness.toB64url(sigBuf), WITNESS_SIGNATURE);
});

test('signatures: authority and witness signing use the same canonical payload bytes', () => {
  const authorityPubKey = witness.rawBytesToPublicKey(witness.fromB64url(SYNTHETIC_AUTHORITY.publicKeyB64url));
  const witnessPubKey = createPublicKey(witness.loadPrivateKey(SYNTHETIC_WITNESS.privateKeyB64url));
  const payload = witness.canonicalPayload(FIXED_STH);
  assert.equal(cryptoVerify(null, payload, authorityPubKey, witness.fromB64url(AUTHORITY_SIGNATURE)), true);
  assert.equal(cryptoVerify(null, payload, witnessPubKey, witness.fromB64url(WITNESS_SIGNATURE)), true);
});

// ── Archive behavior (temp directory only — never the real sth/ tree) ────

function makeTempRepoRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'internal-soul-tlog-test-'));
}

test('archive: archivePathFor produces sth/2020-01-01/42.json', () => {
  const repoRoot = '/fake/repo/root';
  const p = witness.archivePathFor(FIXED_STH, repoRoot);
  assert.equal(path.relative(repoRoot, p), EXPECTED_ARCHIVE_RELATIVE_PATH);
});

test('archive: missing archive file warns and does not throw or write anything', (t) => {
  const repoRoot = makeTempRepoRoot();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  let warned = false;
  const origWarn = console.warn;
  console.warn = (...args) => { warned = true; origWarn(...args); };
  try {
    witness.updateArchive(FIXED_STH, WITNESS_SIGNATURE, 'did:web:test.invalid:swall:witness#key-1', '2020-01-01T00:05:00.000Z', repoRoot);
  } finally {
    console.warn = origWarn;
  }
  assert.equal(warned, true);
  assert.equal(fs.existsSync(path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH)), false);
});

test('archive: existing unwitnessed record is updated with exact expected bytes', (t) => {
  const repoRoot = makeTempRepoRoot();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const filePath = path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, EXPECTED_ARCHIVE_JSON_UNWITNESSED);

  witness.updateArchive(
    FIXED_STH,
    WITNESSED_RECORD.witnessSignature,
    WITNESSED_RECORD.witnessKeyId,
    WITNESSED_RECORD.witnessedAt,
    repoRoot
  );

  const written = fs.readFileSync(filePath, 'utf8');
  assert.equal(written, EXPECTED_ARCHIVE_JSON_WITNESSED);
});

test('archive: existing witnessed record is not overwritten', (t) => {
  const repoRoot = makeTempRepoRoot();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const filePath = path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, EXPECTED_ARCHIVE_JSON_WITNESSED);

  witness.updateArchive(FIXED_STH, 'a-different-signature', 'a-different-key-id', '2099-01-01T00:00:00.000Z', repoRoot);

  const written = fs.readFileSync(filePath, 'utf8');
  assert.equal(written, EXPECTED_ARCHIVE_JSON_WITNESSED, 'file must be untouched once witnessSignature is already present');
});

test('archive: DEFECT (documented, not fixed) — missing sth.timestamp throws an uncaught TypeError', () => {
  assert.throws(
    () => witness.archivePathFor(STH_MISSING_TIMESTAMP, '/fake/repo/root'),
    /Cannot read properties of undefined \(reading 'split'\)/
  );
});

test('archive: DEFECT (documented, not fixed) — timestamp without a "T" silently uses the whole string as the date folder', () => {
  const p = witness.archivePathFor(STH_MALFORMED_TIMESTAMP_NO_T, '/fake/repo/root');
  assert.equal(path.relative('/fake/repo/root', p), 'sth/20200101/42.json');
});

test('archive: DEFECT (documented, not fixed) — non-numeric treeSize is accepted and interpolated as-is', () => {
  const p = witness.archivePathFor(STH_MALFORMED_TREESIZE, '/fake/repo/root');
  assert.equal(path.relative('/fake/repo/root', p), 'sth/2020-01-01/not-a-number.json');
});
