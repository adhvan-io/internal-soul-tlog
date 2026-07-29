/**
 * Byte-identical port of updateArchive() from scripts/sign-sth.js.
 *
 * Two deliberate, additive-only differences from the JS version, neither
 * of which changes filesystem or console behavior:
 *
 *   1. `repoRoot` is a required parameter here, with no default. The JS
 *      version's default (`process.env.GITHUB_WORKSPACE || ...`) reads an
 *      environment variable -- that's a orchestration/configuration
 *      concern, not something a pure persistence module should do itself
 *      (matching src/api-client/'s "configuration supplied by the
 *      caller" precedent from Stage 4).
 *   2. The function returns an ArchiveUpdateOutcome describing what
 *      happened, instead of nothing. The JS version returns nothing on
 *      every path; this is purely additive so the missing-file and
 *      already-witnessed cases are testable without capturing console
 *      output.
 *
 * Everything else -- the exact console.warn/console.log message text, the
 * exact JSON serialization (2-space indent, trailing newline, field
 * order), the file-level idempotency check, and letting a malformed
 * archive file's JSON.parse failure propagate uncaught -- is preserved
 * exactly. See README.md.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SignedTreeHead } from '../protocol/types.js';
import { archivePathFor } from './path.js';

export type ArchiveUpdateOutcome = 'archive-missing' | 'already-witnessed' | 'updated';

export function updateArchive(
  sth: SignedTreeHead,
  witnessSignature: string,
  witnessKeyId: string,
  witnessedAt: string,
  repoRoot: string
): ArchiveUpdateOutcome {
  const filePath = archivePathFor(sth, repoRoot);
  const relPath = path.relative(repoRoot, filePath);

  if (!fs.existsSync(filePath)) {
    console.warn(`[witness] Archive file not found: ${relPath}`);
    console.warn('[witness] API may not have committed it yet — witness signature stored in Firestore only');
    return 'archive-missing';
  }

  // Deliberately unvalidated, matching production exactly: the archive
  // file is not passed through the Stage 2 protocol parsers here, the
  // same way scripts/sign-sth.js never validates it either -- only ever
  // reads one optional field off it before mutating and rewriting it.
  const record: Record<string, unknown> = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (record.witnessSignature) {
    console.log(`[witness] Archive already has witness signature — skipping file update`);
    return 'already-witnessed';
  }

  record.witnessSignature = witnessSignature;
  record.witnessKeyId = witnessKeyId;
  record.witnessedAt = witnessedAt;
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2) + '\n');
  console.log(`[witness] Updated archive: ${relPath}`);
  return 'updated';
}
