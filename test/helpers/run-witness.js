'use strict';

/**
 * Spawns the real production entrypoint (`node scripts/sign-sth.js`) exactly
 * as GitHub Actions does, with a tightly scoped, explicit environment — no
 * ambient process.env is inherited except PATH, so no accidental production
 * credentials (WITNESS_PRIVATE_KEY, SWALL_API_BASE, etc. from the developer's
 * shell) can ever reach the spawned process.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENTRYPOINT = path.join(REPO_ROOT, 'scripts', 'sign-sth.js');

function runWitnessScript(env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [ENTRYPOINT], {
      cwd: REPO_ROOT,
      env: { PATH: process.env.PATH, ...env }, // explicit allowlist, not a spread of process.env
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

module.exports = { runWitnessScript, REPO_ROOT, ENTRYPOINT };
