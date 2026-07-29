import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { archivePathFor } from './path.js';
import { archivePathFor as archivePathForJs } from '../../scripts/sign-sth.js';
import { FIXED_STH } from '../../test/fixtures/synthetic.js';
import { STH_MALFORMED_TIMESTAMP_NO_T, STH_MALFORMED_TREESIZE } from '../../test/fixtures/api-responses.js';
import type { SignedTreeHead } from '../protocol/types.js';

const REPO_ROOT = '/fake/repo/root';

test('path: expected path for the fixed STH', () => {
  const p = archivePathFor(FIXED_STH, REPO_ROOT);
  assert.equal(path.relative(REPO_ROOT, p), 'sth/2020-01-01/42.json');
});

test('path: DEFECT (documented, not fixed) -- timestamp without a T silently uses the whole string as the date folder', () => {
  const p = archivePathFor(STH_MALFORMED_TIMESTAMP_NO_T as SignedTreeHead, REPO_ROOT);
  assert.equal(path.relative(REPO_ROOT, p), 'sth/20200101/42.json');
});

test('path: DEFECT (documented, not fixed) -- non-numeric treeSize is accepted and interpolated as-is', () => {
  const p = archivePathFor(STH_MALFORMED_TREESIZE as SignedTreeHead, REPO_ROOT);
  assert.equal(path.relative(REPO_ROOT, p), 'sth/2020-01-01/not-a-number.json');
});

test('path: DEFECT (documented, not fixed) -- missing timestamp throws, matching JS .split() on undefined', () => {
  const sthWithoutTimestamp = { root: 'x', treeSize: 42, nodeId: 'n' } as unknown as SignedTreeHead;
  assert.throws(() => archivePathFor(sthWithoutTimestamp, REPO_ROOT), /Cannot read properties of undefined/);
});

// Cross-implementation parity: TypeScript vs. the live JavaScript implementation.
test('parity: archivePathFor matches JS archivePathFor for the fixed STH', () => {
  assert.equal(archivePathFor(FIXED_STH, REPO_ROOT), archivePathForJs(FIXED_STH, REPO_ROOT));
});

test('parity: archivePathFor matches JS archivePathFor for every documented quirk fixture', () => {
  for (const sth of [STH_MALFORMED_TIMESTAMP_NO_T, STH_MALFORMED_TREESIZE]) {
    assert.equal(archivePathFor(sth as SignedTreeHead, REPO_ROOT), archivePathForJs(sth, REPO_ROOT));
  }
});
