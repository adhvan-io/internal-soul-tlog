/**
 * Direct child-process checks for the compiled CLI entrypoint
 * (dist/cli/sign-sth.js), mirroring test/witness.childprocess.test.js's
 * coverage of the real production script exactly, so the two can be
 * compared side by side.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { startMockServer } from '../../test/helpers/mock-server.js';
import { SYNTHETIC_WITNESS, WITNESS_KEY_ID } from '../../test/fixtures/synthetic.js';
import { LATEST_STH_RESPONSE_FRESH, IDENTITY_DOCUMENT_MULTIBASE, WITNESS_POST_RESPONSE_SUCCESS } from '../../test/fixtures/api-responses.js';
import { EXPECTED_ARCHIVE_RELATIVE_PATH, EXPECTED_ARCHIVE_JSON_UNWITNESSED } from '../../test/fixtures/archive.js';

const CLI_ENTRYPOINT = path.resolve(process.cwd(), 'dist', 'cli', 'sign-sth.js');

function runCli(env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_ENTRYPOINT], {
      env: { PATH: process.env.PATH ?? '', ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('cli: missing SWALL_API_BASE exits 1 with the exact fatal message, before any network call', async () => {
  const result = await runCli({ WITNESS_PRIVATE_KEY: 'irrelevant' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /\[witness\] FATAL: SWALL_API_BASE env var is required/);
});

test('cli: missing WITNESS_PRIVATE_KEY exits 1 with the exact fatal message', async () => {
  const result = await runCli({ SWALL_API_BASE: 'http://127.0.0.1:1' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /\[witness\] FATAL: WITNESS_PRIVATE_KEY env var is required/);
});

test('cli: successful mocked execution exits 0', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({ body: LATEST_STH_RESPONSE_FRESH }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
    'POST /swall/log/sth/witness': () => ({ body: WITNESS_POST_RESPONSE_SUCCESS }),
  });
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-soul-tlog-cli-test-'));
  t.after(async () => { await server.close(); fs.rmSync(repoRoot, { recursive: true, force: true }); });
  const archivePath = path.join(repoRoot, EXPECTED_ARCHIVE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.writeFileSync(archivePath, EXPECTED_ARCHIVE_JSON_UNWITNESSED);

  const result = await runCli({
    SWALL_API_BASE: server.url,
    WITNESS_PRIVATE_KEY: SYNTHETIC_WITNESS.privateKeyB64url,
    WITNESS_KEY_ID,
    GITHUB_WORKSPACE: repoRoot,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Co-signed ✓/);
});

test('cli: invalid authority signature exits 1', async (t) => {
  const server = await startMockServer({
    'GET /swall/log/sth/latest': () => ({
      body: { sth: LATEST_STH_RESPONSE_FRESH.sth, signature: 'not-a-valid-signature' },
    }),
    'GET /.well-known/swall.json': () => ({ body: IDENTITY_DOCUMENT_MULTIBASE }),
  });
  t.after(() => server.close());

  const result = await runCli({
    SWALL_API_BASE: server.url,
    WITNESS_PRIVATE_KEY: SYNTHETIC_WITNESS.privateKeyB64url,
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /\[witness\] FATAL:/);
});

test('cli: requiring the module for its exports never calls process.exit', async () => {
  const out = await new Promise<string>((resolve) => {
    const child = spawn(process.execPath, ['-e', `require(${JSON.stringify(CLI_ENTRYPOINT)}); console.log('required-ok')`], {
      env: { PATH: process.env.PATH ?? '' },
    });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('close', () => resolve(stdout));
  });
  assert.match(out, /required-ok/);
});
