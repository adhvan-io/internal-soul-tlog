export interface EnvVarEntry {
  path: string | null;
  type: 'string' | 'enum' | 'integer' | 'csv' | 'secret';
  values?: string[];
  required?: boolean;
  testAllowed?: boolean;
  notes?: string;
}

export type EnvVarRegistry = Record<string, EnvVarEntry>;

/**
 * Applies process.env overrides onto a merged (base + environment profile)
 * config object using the environment-variables.json registry as the only
 * source of which variables exist and where they land. Mirrors
 * internal-soul/platform/config/src/apply-env-overrides.js.
 */
export function applyEnvOverrides<T extends Record<string, unknown>>(
  config: T,
  env: NodeJS.ProcessEnv,
  registry: EnvVarRegistry,
  environmentName: string
): T {
  for (const [varName, entry] of Object.entries(registry)) {
    if (varName.startsWith('$')) continue;
    if (!entry.path) continue;
    if (entry.type === 'secret') continue; // handled by the secret provider, not here

    const raw = env[varName];
    if (raw === undefined) continue;
    if (environmentName === 'test' && !entry.testAllowed) continue;

    let value: string | string[];
    if (entry.type === 'enum') {
      if (!entry.values?.includes(raw)) {
        throw new Error(`${varName} must be one of ${entry.values?.join(', ')}, got ${JSON.stringify(raw)}`);
      }
      value = raw;
    } else if (entry.type === 'csv') {
      value = raw.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      value = raw;
    }

    (config as Record<string, unknown>)[entry.path] = value;
  }
  return config;
}
