import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { updateArchive } from './archive.js';
import { updateArchive as updateArchiveJs } from '../../scripts/sign-sth.js';
import { FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT } from '../../test/fixtures/synthetic.js';
import {
  EXPECTED_ARCHIVE_RELATIVE_PATH,
  EXPECTED_ARCHIVE_JSON_UNWITNESSED,
  EXPECTED_ARCHIVE_JSON_WITNESSED,
} from '../../test/fixtures/archive.js';

function makeTempRepoRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'internal-soul-tlog-archive-test-'));
}

function seedUnwitnessedArchive(repoRoot: string): string {
  const filePath = path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, EXPECTED_ARCHIVE_JSON_UNWITNESSED);
  return filePath;
}

// ── Successful update / byte-identical serialization ────────────────────

test('archive: successful update returns "updated" and writes byte-identical output', (t) => {
  const repoRoot = makeTempRepoRoot();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const filePath = seedUnwitnessedArchive(repoRoot);

  const outcome = updateArchive(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, repoRoot);

  assert.equal(outcome, 'updated');
  const written = fs.readFileSync(filePath);
  const expected = Buffer.from(EXPECTED_ARCHIVE_JSON_WITNESSED);
  assert.equal(Buffer.compare(written, expected), 0);
});

test('archive: no writes occur outside the given repoRoot', (t) => {
  const repoRoot = makeTempRepoRoot();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  seedUnwitnessedArchive(repoRoot);

  updateArchive(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, repoRoot);

  const allFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else allFiles.push(full);
    }
  };
  walk(repoRoot);
  assert.deepEqual(allFiles, [path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH)]);
});

// ── Already witnessed (file-level idempotency) ───────────────────────────

test('archive: already-witnessed file is left untouched', (t) => {
  const repoRoot = makeTempRepoRoot();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const filePath = path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, EXPECTED_ARCHIVE_JSON_WITNESSED);

  const outcome = updateArchive(FIXED_STH, 'a-different-signature', 'a-different-key-id', '2099-01-01T00:00:00.000Z', repoRoot);

  assert.equal(outcome, 'already-witnessed');
  const written = fs.readFileSync(filePath);
  assert.equal(Buffer.compare(written, Buffer.from(EXPECTED_ARCHIVE_JSON_WITNESSED)), 0);
});

// ── Missing archive ───────────────────────────────────────────────────────

test('archive: missing archive file returns "archive-missing", warns, creates nothing', (t) => {
  const repoRoot = makeTempRepoRoot();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };
  let outcome;
  try {
    outcome = updateArchive(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, repoRoot);
  } finally {
    console.warn = origWarn;
  }

  assert.equal(outcome, 'archive-missing');
  assert.equal(warnings.length, 2);
  assert.match(warnings[0]!, /Archive file not found/);
  assert.equal(fs.existsSync(path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH)), false);
});

// ── Malformed archive JSON ────────────────────────────────────────────────

test('archive: malformed archive JSON propagates uncaught, matching production', (t) => {
  const repoRoot = makeTempRepoRoot();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const filePath = path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'this is not { valid json');

  assert.throws(
    () => updateArchive(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, repoRoot),
    SyntaxError
  );
});

// ── Repeated update ───────────────────────────────────────────────────────

test('archive: repeated update is idempotent -- second call is a no-op', (t) => {
  const repoRoot = makeTempRepoRoot();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const filePath = seedUnwitnessedArchive(repoRoot);

  const first = updateArchive(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, repoRoot);
  const afterFirst = fs.readFileSync(filePath);

  const second = updateArchive(FIXED_STH, 'a-different-signature', 'a-different-key-id', '2099-01-01T00:00:00.000Z', repoRoot);
  const afterSecond = fs.readFileSync(filePath);

  assert.equal(first, 'updated');
  assert.equal(second, 'already-witnessed');
  assert.equal(Buffer.compare(afterFirst, afterSecond), 0);
});

// ── Cross-implementation parity: TypeScript vs. the live JavaScript implementation ──

test('parity: serialized bytes are byte-identical to the JS implementation', (t) => {
  const tsRoot = makeTempRepoRoot();
  const jsRoot = makeTempRepoRoot();
  t.after(() => {
    fs.rmSync(tsRoot, { recursive: true, force: true });
    fs.rmSync(jsRoot, { recursive: true, force: true });
  });
  const tsFile = seedUnwitnessedArchive(tsRoot);
  const jsFile = seedUnwitnessedArchive(jsRoot);

  updateArchive(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, tsRoot);
  updateArchiveJs(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, jsRoot);

  assert.equal(Buffer.compare(fs.readFileSync(tsFile), fs.readFileSync(jsFile)), 0);
});

test('parity: missing archive -- both implementations create nothing and throw nothing', (t) => {
  const tsRoot = makeTempRepoRoot();
  const jsRoot = makeTempRepoRoot();
  t.after(() => {
    fs.rmSync(tsRoot, { recursive: true, force: true });
    fs.rmSync(jsRoot, { recursive: true, force: true });
  });

  assert.doesNotThrow(() => updateArchive(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, tsRoot));
  assert.doesNotThrow(() => updateArchiveJs(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, jsRoot));
  assert.equal(fs.existsSync(path.join(tsRoot, EXPECTED_ARCHIVE_RELATIVE_PATH)), false);
  assert.equal(fs.existsSync(path.join(jsRoot, EXPECTED_ARCHIVE_RELATIVE_PATH)), false);
});

test('parity: malformed archive JSON -- both implementations throw SyntaxError uncaught', (t) => {
  const tsRoot = makeTempRepoRoot();
  const jsRoot = makeTempRepoRoot();
  t.after(() => {
    fs.rmSync(tsRoot, { recursive: true, force: true });
    fs.rmSync(jsRoot, { recursive: true, force: true });
  });
  for (const root of [tsRoot, jsRoot]) {
    const filePath = path.join(root, EXPECTED_ARCHIVE_RELATIVE_PATH);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'this is not { valid json');
  }

  assert.throws(() => updateArchive(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, tsRoot), SyntaxError);
  assert.throws(() => updateArchiveJs(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, jsRoot), SyntaxError);
});

test('parity: already-witnessed -- both implementations leave the file byte-identical and untouched', (t) => {
  const tsRoot = makeTempRepoRoot();
  const jsRoot = makeTempRepoRoot();
  t.after(() => {
    fs.rmSync(tsRoot, { recursive: true, force: true });
    fs.rmSync(jsRoot, { recursive: true, force: true });
  });
  for (const root of [tsRoot, jsRoot]) {
    const filePath = path.join(root, EXPECTED_ARCHIVE_RELATIVE_PATH);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, EXPECTED_ARCHIVE_JSON_WITNESSED);
  }

  updateArchive(FIXED_STH, 'different-sig', 'different-kid', '2099-01-01T00:00:00.000Z', tsRoot);
  updateArchiveJs(FIXED_STH, 'different-sig', 'different-kid', '2099-01-01T00:00:00.000Z', jsRoot);

  const tsBytes = fs.readFileSync(path.join(tsRoot, EXPECTED_ARCHIVE_RELATIVE_PATH));
  const jsBytes = fs.readFileSync(path.join(jsRoot, EXPECTED_ARCHIVE_RELATIVE_PATH));
  assert.equal(Buffer.compare(tsBytes, jsBytes), 0);
  assert.equal(Buffer.compare(tsBytes, Buffer.from(EXPECTED_ARCHIVE_JSON_WITNESSED)), 0);
});

test('parity: repeated update -- both implementations produce byte-identical results after two calls', (t) => {
  const tsRoot = makeTempRepoRoot();
  const jsRoot = makeTempRepoRoot();
  t.after(() => {
    fs.rmSync(tsRoot, { recursive: true, force: true });
    fs.rmSync(jsRoot, { recursive: true, force: true });
  });
  seedUnwitnessedArchive(tsRoot);
  seedUnwitnessedArchive(jsRoot);

  updateArchive(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, tsRoot);
  updateArchive(FIXED_STH, 'ignored', 'ignored', 'ignored', tsRoot);
  updateArchiveJs(FIXED_STH, WITNESS_SIGNATURE, WITNESS_KEY_ID, WITNESSED_AT, jsRoot);
  updateArchiveJs(FIXED_STH, 'ignored', 'ignored', 'ignored', jsRoot);

  const tsBytes = fs.readFileSync(path.join(tsRoot, EXPECTED_ARCHIVE_RELATIVE_PATH));
  const jsBytes = fs.readFileSync(path.join(jsRoot, EXPECTED_ARCHIVE_RELATIVE_PATH));
  assert.equal(Buffer.compare(tsBytes, jsBytes), 0);
});
