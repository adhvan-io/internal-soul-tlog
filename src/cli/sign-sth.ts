/**
 * Thin CLI entrypoint. Compiles to a directly runnable JavaScript file
 * (dist/cli/sign-sth.js) intended for eventual production use, but NOT
 * wired into .github/workflows/witness.yml this stage -- scripts/sign-sth.js
 * remains the production entrypoint (kept as a documented legacy parity
 * oracle -- Phase 6, config/README.md).
 *
 * All the logic lives in src/witness/ (a testable library that throws
 * ordinary Error and returns a WitnessOutcome). This file's only job is
 * the same one the `if (require.main === module)` block at the bottom of
 * scripts/sign-sth.js does: load config, run the flow, and translate the
 * result into the exact fatal-message format and exit code scripts/sign-sth.js
 * itself uses. Config now goes through config/'s loadTlogConfig() (the
 * four-environment wrapper) rather than calling loadWitnessConfig()
 * directly -- the actual value derivation is unchanged either way.
 */

import { loadTlogConfig } from '../../config/dist/index.js';
import { loadWitnessConfig } from '../witness/config.js';
import { runWitness } from '../witness/witness.js';

function fatal(message: string): never {
  console.error('[witness] FATAL:', message);
  process.exit(1);
}

if (require.main === module) {
  (async () => {
    let config;
    try {
      config = loadWitnessConfig(loadTlogConfig().witnessEnv);
    } catch (e) {
      fatal((e as Error).message);
    }

    try {
      await runWitness(config);
    } catch (e) {
      fatal((e as Error).message);
    }
  })();
}
