'use strict';

/**
 * SYNTHETIC TEST FIXTURES — NOT PRODUCTION KEYS.
 *
 * Every key, signature, and identifier in this file was generated once,
 * offline, specifically for the offline behavioral-baseline test suite in
 * test/. None of it was derived from, or is usable against, any real SWALL
 * authority, witness, or production endpoint. Do not reuse these keys for
 * anything other than this test suite.
 *
 * Ed25519 signing has no random nonce, so signature outputs below are
 * deterministic: the same key + payload always produces the exact same
 * signature bytes. That determinism is what makes byte-identical parity
 * checking possible, both within this suite and later against a
 * TypeScript reimplementation. These values must stay frozen — do not
 * regenerate them.
 */

// Fixed Signed Tree Head used across the whole suite.
const FIXED_STH = Object.freeze({
  root: 'a3f5c9e1d2b4f6a8c0e2d4b6f8a0c2e4d6b8f0a2c4e6d8b0f2a4c6e8d0b2f4a6',
  treeSize: 42,
  timestamp: '2020-01-01T00:00:00.000Z',
  nodeId: 'test-node-fixture-1',
});

// Exact expected canonicalize(FIXED_STH) output — pins json-canonicalize's
// exact key-ordering/formatting behavior independent of signing.
const CANONICAL_PAYLOAD_STRING =
  '{"nodeId":"test-node-fixture-1","root":"a3f5c9e1d2b4f6a8c0e2d4b6f8a0c2e4d6b8f0a2c4e6d8b0f2a4c6e8d0b2f4a6","timestamp":"2020-01-01T00:00:00.000Z","treeSize":42}';

const CANONICAL_PAYLOAD_HEX =
  '7b226e6f64654964223a22746573742d6e6f64652d666978747572652d31222c22726f6f74223a2261336635633965316432623466366138633065326434623666386130633265346436623866306132633465366438623066326134633665386430623266346136222c2274696d657374616d70223a22323032302d30312d30315430303a30303a30302e3030305a222c227472656553697a65223a34327d';

// Synthetic authority keypair (raw 32-byte Ed25519 key material, base64url).
const SYNTHETIC_AUTHORITY = Object.freeze({
  privateKeyB64url: '2TAoeKkFddyC_PMU6VELck8tGdeaDqHM9WaoW5y1_O8',
  publicKeyB64url: '4AVvqEGZfQtZZAHLk3u8GvCQ_bwI2hC0TxdqkGcQF00',
});

// Synthetic witness keypair (raw 32-byte Ed25519 key material, base64url).
const SYNTHETIC_WITNESS = Object.freeze({
  privateKeyB64url: 'y3At3g374UuJIH-aIc4LhfqBSylpEixFDhduh2KmTEA',
  publicKeyB64url: 'DpuLP16CaPnMkIOZnftqk9dTCRMcYyNQrnEFxIzrKoY',
});

// Signature of CANONICAL_PAYLOAD_STRING under SYNTHETIC_AUTHORITY, base64url no padding.
const AUTHORITY_SIGNATURE =
  'Y9aTuaXCBPskuPV02r2SgPjkDIfY--sXst5vH0b3Wjj3bJ84aS_xlmyWAIO6OP9elQ1W6-syg61-K_FUJMDpDA';

// AUTHORITY_SIGNATURE with its final byte flipped — must fail verification.
const INVALID_AUTHORITY_SIGNATURE =
  'Y9aTuaXCBPskuPV02r2SgPjkDIfY--sXst5vH0b3Wjj3bJ84aS_xlmyWAIO6OP9elQ1W6-syg61-K_FUJMDp8w';

// Signature of CANONICAL_PAYLOAD_STRING under SYNTHETIC_WITNESS, base64url no padding.
const WITNESS_SIGNATURE =
  'GOx4IXOKeomWXJ7ZpHVB97qHozRQ4r9AcUBe8m1mS4SjKBpBb8bZ_X3jVVKIgFT_GhCapSnDWQJNQyFRTA-zCw';

// SYNTHETIC_AUTHORITY's public key encoded as a multibase (base58btc, 'z'-prefixed,
// multicodec 0xed 0x01 Ed25519-pub) verification method — decodes to
// SYNTHETIC_AUTHORITY.publicKeyB64url via the production base58Decode + multicodec-strip logic.
const MULTIBASE_VERIFICATION_METHOD = Object.freeze({
  publicKeyMultibase: 'z6MkuXkBFX6xwVj2oBkhnzJbXBgJkieiumBL5qvPRhvtxJXv',
});

// SYNTHETIC_AUTHORITY's public key encoded as a JWK verification method.
const JWK_VERIFICATION_METHOD = Object.freeze({
  publicKeyJwk: {
    kty: 'OKP',
    crv: 'Ed25519',
    x: SYNTHETIC_AUTHORITY.publicKeyB64url,
  },
});

// Fixed witness key ID and witnessed-at timestamp used wherever tests need a
// deterministic value instead of the DID-fallback derivation or wall-clock time.
const WITNESS_KEY_ID = 'did:web:test.invalid:swall:witness#key-1';
const WITNESSED_AT = '2020-01-01T00:05:00.000Z';

module.exports = {
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
  WITNESS_KEY_ID,
  WITNESSED_AT,
};
