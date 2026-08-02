import { existsSync, readFileSync } from 'node:fs';

export interface SecretProvider {
  getRequired(ref: string): string;
  getOptional(ref: string): string | null;
}

interface SecretBinding {
  binding: 'env';
  envVar: string;
  required?: boolean;
}

function createLocalFileProvider(filePath: string): SecretProvider {
  let data: Record<string, string> = {};
  if (existsSync(filePath)) {
    data = JSON.parse(readFileSync(filePath, 'utf8'));
  }
  return {
    getRequired(ref) {
      const value = data[ref];
      if (!value) {
        throw new Error(
          `Missing required secret '${ref}' in ${filePath}. ` +
          `Copy config/examples/secrets.local.example.json to config/local/secrets.json and fill it in.`
        );
      }
      return value;
    },
    getOptional(ref) {
      return data[ref] ?? null;
    },
  };
}

function createFixtureProvider(fixture: Record<string, string>): SecretProvider {
  return {
    getRequired(ref) {
      const value = fixture[ref];
      if (!value) throw new Error(`Missing required test-fixture secret '${ref}'.`);
      return value;
    },
    getOptional(ref) {
      return fixture[ref] ?? null;
    },
  };
}

/**
 * GitHub Actions delivers WITNESS_PRIVATE_KEY as a Secret bound directly to
 * the workflow's env: block (deployment topology, unchanged by this phase)
 * -- there is no separate SDK call to make, so this is just a named,
 * documented process.env read rather than an ambient one.
 */
function createGithubActionsSecretProvider(bindings: Record<string, SecretBinding>, env: NodeJS.ProcessEnv): SecretProvider {
  function resolve(ref: string): string | null {
    const binding = bindings[ref];
    if (!binding) throw new Error(`No secret binding registered for '${ref}'`);
    return env[binding.envVar] ?? null;
  }
  return {
    getRequired(ref) {
      const value = resolve(ref);
      if (!value) {
        const binding = bindings[ref];
        throw new Error(`Missing required secret '${ref}' (source: ${binding?.envVar}).`);
      }
      return value;
    },
    getOptional(ref) {
      return resolve(ref);
    },
  };
}

export function loadSecretProvider(options: {
  type: string;
  localFilePath?: string;
  fixture?: Record<string, string>;
  bindings: Record<string, SecretBinding>;
  env: NodeJS.ProcessEnv;
}): SecretProvider {
  switch (options.type) {
    case 'local-file':
      return createLocalFileProvider(options.localFilePath!);
    case 'fixture':
      return options.fixture
        ? createFixtureProvider(options.fixture)
        : createGithubActionsSecretProvider(options.bindings, options.env);
    case 'github-actions-secret':
      return createGithubActionsSecretProvider(options.bindings, options.env);
    default:
      throw new Error(`Unknown secret provider type '${options.type}'`);
  }
}
