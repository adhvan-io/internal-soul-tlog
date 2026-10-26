export interface WitnessNormalizedConfig {
  environment: string;
  swallApiBase: string | null;
  secretProvider: { type: string };
}

/** Cross-field, per-environment invariant checks — mirrors internal-soul's model at a smaller scale. */
export function validateEnvironmentInvariants(config: WitnessNormalizedConfig): string[] {
  const errors: string[] = [];
  const env = config.environment;

  if (env === 'staging' || env === 'production') {
    if (config.secretProvider.type !== 'github-actions-secret') {
      errors.push(`secretProvider.type: must be 'github-actions-secret' in ${env}, got '${config.secretProvider.type}'`);
    }
  }

  if (env === 'development' || env === 'test') {
    if (config.secretProvider.type === 'github-actions-secret') {
      errors.push(`secretProvider.type: 'github-actions-secret' should not be used in ${env} -- use 'local-file' or 'fixture'`);
    }
  }

  return errors;
}
