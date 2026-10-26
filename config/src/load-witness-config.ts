import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyEnvOverrides, type EnvVarRegistry } from './apply-env-overrides.js';
import { validateStructure, validateSecrets, type JsonSchema } from './validate-witness-config.js';
import { validateEnvironmentInvariants } from './validate-environment-invariants.js';
import { loadSecretProvider } from './secret-provider.js';
import { deepFreeze } from './deep-freeze.js';

const ENVIRONMENTS = ['development', 'test', 'staging', 'production'] as const;
type Environment = (typeof ENVIRONMENTS)[number];

const CONFIG_ROOT = join(__dirname, '..'); // config/dist/load-witness-config.js -> config/

interface NonSecretConfig {
  environment: Environment;
  swallApiBase: string | null;
  witnessKeyIdOverride: string | null;
  repoRootOverride: string | null;
  secretProvider: { type: string; path?: string };
  secretRefs: { witnessPrivateKey: string };
}

function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(join(CONFIG_ROOT, relPath), 'utf8')) as T;
}

function stripCommentKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...obj };
  for (const key of Object.keys(result)) {
    if (key.startsWith('$')) delete result[key];
  }
  return result;
}

export interface TlogConfig {
  environment: Environment;
  /**
   * A fully resolved, validated env-like object -- pass this directly to
   * src/witness/config.ts's loadWitnessConfig() to get the final
   * WitnessConfig. Deliberately NOT calling loadWitnessConfig() from inside
   * this package: config/'s own TypeScript project (rootDir: config/src)
   * cannot import across into the main src/ tree, and doing so here would
   * also create a circular build order (config/ needs dist/witness/*.js,
   * which needs config/dist/*.js for src/cli/sign-sth.ts). The caller
   * composes the two; see src/cli/sign-sth.ts.
   */
  witnessEnv: NodeJS.ProcessEnv;
}

/**
 * Precedence: base defaults -> one environment profile -> env-var overrides
 * -> secret-reference resolution -> structural validation -> environment-
 * invariant validation -> deep freeze. Produces the resolved environment
 * src/witness/config.ts's loadWitnessConfig() consumes for the actual
 * swallApiBase/witnessKeyId/repoRoot derivation, which stays a byte-
 * identical port of scripts/sign-sth.js and is not reimplemented here.
 */
export function loadTlogConfig(options: { env?: NodeJS.ProcessEnv; secretsFixture?: Record<string, string> } = {}): TlogConfig {
  const env = options.env ?? process.env;

  const environment = env.SWALL_ENV as Environment;
  if (!ENVIRONMENTS.includes(environment)) {
    throw new Error(`SWALL_ENV must be one of ${ENVIRONMENTS.join(', ')}; got ${JSON.stringify(environment)}.`);
  }

  const base = stripCommentKeys(readJson<Record<string, unknown>>('defaults/base.json'));
  const profile = stripCommentKeys(readJson<Record<string, unknown>>(`environments/${environment}.json`));
  const merged = { ...base, ...profile } as unknown as NonSecretConfig;

  const registry = readJson<EnvVarRegistry>('mappings/environment-variables.json');
  applyEnvOverrides(merged as unknown as Record<string, unknown>, env, registry, environment);

  const bindings = readJson<Record<string, { binding: 'env'; envVar: string; required?: boolean; validation?: { minLength?: number } }>>(
    'mappings/secret-bindings.json'
  );
  const provider = loadSecretProvider({
    type: merged.secretProvider.type,
    localFilePath: resolve(CONFIG_ROOT, '..', merged.secretProvider.path ?? 'config/local/secrets.json'),
    ...(options.secretsFixture ? { fixture: options.secretsFixture } : {}),
    bindings,
    env,
  });

  const secrets: Record<string, string | undefined> = {
    witnessPrivateKey: provider.getOptional('witnessPrivateKey') ?? undefined,
  };

  const isProductionLikeMode = merged.secretProvider.type === 'github-actions-secret';

  const schema = readJson<JsonSchema>('schema/witness-config.schema.json');
  const structuralErrors = validateStructure(merged, schema);
  const secretErrors = validateSecrets(secrets, bindings, { enforceRequired: isProductionLikeMode });
  const invariantErrors = validateEnvironmentInvariants(merged);

  const allErrors = [...structuralErrors, ...secretErrors, ...invariantErrors];
  if (allErrors.length) {
    throw new Error(`Witness configuration is invalid:\n  ${allErrors.join('\n  ')}`);
  }

  // Actual value derivation stays exactly loadWitnessConfig()'s job -- this
  // layer only adds the environment-profile/secret-provider/invariant layer
  // around it, matching production behavior byte-for-byte otherwise.
  const witnessEnv: NodeJS.ProcessEnv = {
    ...env,
    WITNESS_PRIVATE_KEY: secrets.witnessPrivateKey ?? env.WITNESS_PRIVATE_KEY,
    WITNESS_KEY_ID: merged.witnessKeyIdOverride ?? env.WITNESS_KEY_ID,
    GITHUB_WORKSPACE: merged.repoRootOverride ?? env.GITHUB_WORKSPACE,
  };

  deepFreeze(merged);

  return Object.freeze({ environment, witnessEnv });
}
