/**
 * Byte-identical port of the environment-variable loading and witnessKeyId
 * derivation from scripts/sign-sth.js's `if (require.main === module)`
 * block. See README.md for the one deliberate, documented translation
 * (the GITHUB_WORKSPACE fallback -- see repoRoot below).
 */

export interface WitnessConfig {
  /** Normalized (trailing slash stripped), from SWALL_API_BASE. Required. */
  swallApiBase: string;
  /** Raw base64url string, from WITNESS_PRIVATE_KEY. Required. */
  witnessPrivateKey: string;
  /**
   * Fully resolved: the explicit WITNESS_KEY_ID env var if set, otherwise
   * the did:web DID-fallback derived from swallApiBase. Resolved once,
   * here, rather than at the point of use during signing -- it has no
   * dependency on anything fetched over the network, so precomputing it
   * during config loading doesn't change when it's actually consumed or
   * what value it produces. See deriveWitnessKeyId() and README.md.
   */
  witnessKeyId: string;
  /** Repository root archive paths are resolved against, from GITHUB_WORKSPACE. */
  repoRoot: string;
  /**
   * Optional pin, from SWALL_AUTHORITY_PUBLIC_KEY (base64url, raw 32-byte
   * Ed25519). When set, the key the audited server serves must equal it, so a
   * server cannot swap the key it is checked against (audit G6).
   */
  authorityPublicKey?: string;
}

/**
 * Byte-identical port of the witnessKeyId construction in
 * scripts/sign-sth.js (lines constructing `hostMatch`/`host`/`witnessKeyId`).
 * An explicit, non-empty WITNESS_KEY_ID always wins (`||`, so an empty
 * string still falls through to the fallback, matching JS). The fallback
 * extracts the host from `swallApiBase` via the same regex; anything that
 * doesn't match becomes the literal fallback host `'swall-api'`.
 */
export function deriveWitnessKeyId(swallApiBase: string, explicit: string | undefined): string {
  if (explicit) return explicit;
  const hostMatch = swallApiBase.match(/https?:\/\/([^/]+)/);
  const host = hostMatch?.[1] ?? 'swall-api';
  return `did:web:${host.replace(/:/g, '%3A')}:swall:witness#key-1`;
}

export function loadWitnessConfig(env: NodeJS.ProcessEnv): WitnessConfig {
  const swallApiBase = (env.SWALL_API_BASE ?? '').replace(/\/$/, '');
  if (!swallApiBase) throw new Error('SWALL_API_BASE env var is required');

  const witnessPrivateKey = env.WITNESS_PRIVATE_KEY ?? '';
  if (!witnessPrivateKey) throw new Error('WITNESS_PRIVATE_KEY env var is required');

  const witnessKeyId = deriveWitnessKeyId(swallApiBase, env.WITNESS_KEY_ID);

  // scripts/sign-sth.js falls back to path.resolve(__dirname, '..') when
  // GITHUB_WORKSPACE is unset -- a location relative to *that specific
  // file*, which has no faithful equivalent from a different compiled
  // file location, and which never actually executes in production
  // anyway (GitHub Actions always sets GITHUB_WORKSPACE). process.cwd()
  // is used instead: it matches the actual local-dev invocation pattern
  // (run from the repo root) and never diverges from JS in any scenario
  // that occurs in practice. See README.md.
  const repoRoot = env.GITHUB_WORKSPACE ?? process.cwd();

  const authorityPublicKey = env.SWALL_AUTHORITY_PUBLIC_KEY || undefined;

  return { swallApiBase, witnessPrivateKey, witnessKeyId, repoRoot, ...(authorityPublicKey && { authorityPublicKey }) };
}
