/**
 * Composes protocol + crypto + api-client + archive into the complete
 * witness flow, reproducing scripts/sign-sth.js's main IIFE step for step.
 * Throws ordinary Error on failure (mirroring fatal()'s message text,
 * un-prefixed -- the CLI adapter adds "[witness] FATAL:" and exits 1,
 * exactly as fatal() itself does). Returns a WitnessOutcome on every
 * success/idempotent-exit path. See README.md for the full trust-decision
 * sequence and the two known, documented message-text divergences from
 * JS caused by Stage 2/4's earlier validation boundary.
 */

import { createSwallApiClient } from '../api-client/index.js';
import { canonicalPayloadBytes } from '../crypto/canonical.js';
import { decodeBase64url } from '../crypto/base64url.js';
import { importPrivateKey, importPublicKey } from '../crypto/keys.js';
import { signPayload, verifySignature } from '../crypto/ed25519.js';
import { updateArchive } from '../archive/archive.js';
import { resolveAuthorityPublicKey } from './identity.js';
import type { WitnessConfig } from './config.js';
import type { LatestSTHResponse, IdentityDocument, WitnessPostResponse } from '../protocol/types.js';

export type WitnessOutcome =
  | { status: 'witnessed'; treeSize: number }
  | { status: 'already-witnessed'; treeSize: number }
  | { status: 'race-lost'; treeSize: number };

export interface WitnessDependencies {
  /** Injectable clock, for deterministic tests of the witnessedAt fallback. Defaults to the real clock. */
  now?: () => string;
}

export async function runWitness(config: WitnessConfig, deps: WitnessDependencies = {}): Promise<WitnessOutcome> {
  const now = deps.now ?? (() => new Date().toISOString());
  const client = createSwallApiClient({ baseUrl: config.swallApiBase });

  // 2-3. Fetch latest STH; required-field validation happens inside
  // getLatestSTH() via the Stage 2 protocol parser (see README.md for the
  // resulting message-text divergence from JS's separate, later check).
  let latest: LatestSTHResponse;
  try {
    latest = await client.getLatestSTH();
  } catch (e) {
    throw new Error(`Failed to fetch STH: ${(e as Error).message}`);
  }

  // 4. Exit early if already witnessed -- identity is never fetched on this path.
  if ('witnessSignature' in latest) {
    console.log(`[witness] treeSize=${latest.sth.treeSize} already co-signed — updating archive only`);
    updateArchive(latest.sth, latest.witnessSignature, latest.witnessKeyId, latest.witnessedAt, config.repoRoot);
    return { status: 'already-witnessed', treeSize: latest.sth.treeSize };
  }

  const { sth, signature: authoritySignature } = latest;

  // 5. Fetch identity document.
  let identityDoc: IdentityDocument;
  try {
    identityDoc = await client.getIdentityDocument();
  } catch (e) {
    throw new Error(`Failed to fetch authority identity: ${(e as Error).message}`);
  }

  // 6. Resolve authority public key.
  let authorityPubKeyRaw: Buffer;
  try {
    authorityPubKeyRaw = resolveAuthorityPublicKey(identityDoc);
  } catch (e) {
    throw new Error(`Cannot parse authority public key: ${(e as Error).message}`);
  }
  const authorityPubKey = importPublicKey(authorityPubKeyRaw);

  // 7-8. Canonicalize and verify.
  const payload = canonicalPayloadBytes(sth);
  const authValid = verifySignature(payload, authorityPubKey, authoritySignature);

  // 9. Fail closed -- no witness signature is computed past this point.
  if (!authValid) {
    throw new Error(`Authority signature invalid for treeSize=${sth.treeSize} — refusing to co-sign`);
  }

  console.log(`[witness] Authority signature verified ✓ treeSize=${sth.treeSize} root=${sth.root.slice(0, 16)}…`);

  // 10-11. Import witness key and sign.
  const privKey = importPrivateKey(decodeBase64url(config.witnessPrivateKey));
  const witnessSignature = signPayload(payload, privKey);

  // 12. witnessKeyId was already resolved during config loading (see config.ts).
  const witnessKeyId = config.witnessKeyId;

  // 13. POST co-signature.
  let result: WitnessPostResponse;
  try {
    result = await client.postWitnessSignature({ sth, witnessSignature, witnessKeyId });
  } catch (e) {
    throw new Error(`Failed to submit co-signature: ${(e as Error).message}`);
  }

  // `||`, not `??`, matching scripts/sign-sth.js exactly: an empty-string
  // witnessedAt from the server would also fall through to the clock.
  const witnessedAt = result.witnessedAt || now();

  // 14. Handle already-cosigned race.
  if (result.alreadyCosigned) {
    console.log(`[witness] treeSize=${sth.treeSize} already co-signed (race) — ok`);
  } else {
    // Deliberately `result.treeSize`, not `sth.treeSize` -- if the server
    // omits it, this prints "treeSize=undefined", exactly like JS does.
    console.log(`[witness] Co-signed ✓ treeSize=${result.treeSize} at ${witnessedAt}`);
  }

  // 15. Update the archive.
  updateArchive(sth, witnessSignature, witnessKeyId, witnessedAt, config.repoRoot);

  // 16. Report the outcome.
  return result.alreadyCosigned
    ? { status: 'race-lost', treeSize: sth.treeSize }
    : { status: 'witnessed', treeSize: sth.treeSize };
}
