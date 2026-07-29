/**
 * Canonical description of the SWALL wire protocol as scripts/sign-sth.js
 * actually implements it today. Every field here corresponds to a field the
 * JavaScript implementation reads or writes right now — nothing speculative,
 * no future protocol versions, no fields "we'll probably need eventually."
 *
 * These types are not wired into the production signing path in this
 * stage. See src/protocol/README.md for the trust-boundary this module
 * establishes and why TypeScript types alone cannot validate network input.
 */

/** A Signed Tree Head, exactly as canonicalized and signed today. */
export interface SignedTreeHead {
  root: string;
  treeSize: number;
  /** ISO-8601. archivePathFor() derives the archive date folder from this. */
  timestamp: string;
  /**
   * Present on the wire and covered by the signature (it's part of
   * canonicalize(sth)), but not currently read by scripts/sign-sth.js
   * itself. Included here because it's genuinely part of the signed
   * protocol payload, not because this consumer uses it.
   */
  nodeId: string;
}

/** An archive record, or a GET /swall/log/sth/latest response, before witnessing. */
export interface UnwitnessedRecord {
  sth: SignedTreeHead;
  signature: string;
}

/** An archive record, or a GET /swall/log/sth/latest response, after witnessing. */
export interface WitnessedRecord {
  sth: SignedTreeHead;
  signature: string;
  witnessSignature: string;
  witnessKeyId: string;
  witnessedAt: string;
}

/**
 * The archive format (sth/{date}/{treeSize}.json). A discriminated union on
 * the presence of `witnessSignature` — there is no explicit tag field on
 * the wire, so the two variants are distinguished structurally. This makes
 * "witnessKeyId present without witnessSignature" (an illegal state under
 * the current protocol) impossible to construct.
 */
export type WitnessRecord = UnwitnessedRecord | WitnessedRecord;

/**
 * GET /swall/log/sth/latest has exactly the same shape as an archive
 * record — the API returns the already-witnessed fields inline once a
 * co-signature exists. Not a coincidence worth abstracting away: it's the
 * same JSON, so it gets the same type.
 */
export type LatestSTHResponse = WitnessRecord;

/** POST /swall/log/sth/witness request body, exactly as sent today. */
export interface WitnessPostRequest {
  sth: SignedTreeHead;
  witnessSignature: string;
  witnessKeyId: string;
}

/**
 * POST /swall/log/sth/witness response. All fields are read defensively by
 * the current implementation (`result.alreadyCosigned`, `result.treeSize`,
 * `result.witnessedAt` are all optional-chained or `||`-defaulted) — no
 * field is actually required by today's code, so none are modeled as
 * required here. A discriminated success/alreadyCosigned union would
 * overstate how strictly the current implementation actually treats this
 * response; see src/protocol/README.md for why that was deliberately not done.
 */
export interface WitnessPostResponse {
  alreadyCosigned?: boolean;
  treeSize?: number;
  witnessedAt?: string;
}

/** The authority key encoded as a DID multibase (base58btc) value. */
export interface MultibaseVerificationMethod {
  publicKeyMultibase: string;
}

/**
 * The authority key encoded as a JWK. Only `x` is modeled: it's the only
 * field extractAuthorityPublicKey() reads today. `kty`/`crv` appear on real
 * identity documents (see test fixtures) but are not validated by the
 * current implementation — a known gap carried over from Stage 0, not
 * silently fixed by adding stricter types here.
 */
export interface JwkVerificationMethod {
  publicKeyJwk: {
    x: string;
  };
}

/** The real protocol union: exactly the two encodings extractAuthorityPublicKey() supports. */
export type VerificationMethod = MultibaseVerificationMethod | JwkVerificationMethod;

/**
 * GET /.well-known/swall.json. Both `verificationMethod` and
 * `verificationMethods` are modeled because the current implementation
 * tolerates both key names (`identityDoc.verificationMethod ||
 * identityDoc.verificationMethods`) — an existing protocol looseness, not
 * something to normalize away here.
 */
export interface IdentityDocument {
  verificationMethod?: VerificationMethod[];
  verificationMethods?: VerificationMethod[];
}

/**
 * Configuration as scripts/sign-sth.js actually derives it from environment
 * variables today — after normalization (swallApiBase has its trailing
 * slash stripped, matching `API_BASE`), not the raw env var strings. No
 * configuration is modeled here that the current implementation doesn't
 * already read.
 */
export interface WitnessConfig {
  swallApiBase: string;
  witnessPrivateKey: string;
  witnessKeyId?: string;
}
