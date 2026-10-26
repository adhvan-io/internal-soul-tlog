/** Small hand-written validator — same rationale as internal-soul's (no ajv/zod/joi dependency for a small, non-recursive shape). */

export interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  minLength?: number;
}

export function validateStructure(value: unknown, schema: JsonSchema, path = '$'): string[] {
  const errors: string[] = [];
  walk(value, schema, path, errors);
  return errors;
}

function walk(value: unknown, schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.enum) {
    if (!schema.enum.includes(value)) {
      errors.push(`${path}: must be one of ${schema.enum.join(', ')}, got ${JSON.stringify(value)}`);
      return;
    }
  }

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length && !types.some((t) => matchesType(value, t))) {
    errors.push(`${path}: expected type ${types.join(' | ')}, got ${JSON.stringify(value)}`);
    return;
  }

  if (schema.type === 'object' && value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path}.${key}: required field is missing`);
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) errors.push(`${path}.${key}: unknown field (not in schema)`);
      }
    }
    for (const [key, subSchema] of Object.entries(schema.properties ?? {})) {
      if (key in obj) walk(obj[key], subSchema, `${path}.${key}`, errors);
    }
  }
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'null': return value === null;
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    default: return true;
  }
}

/** Secret-material validation: presence + minLength only (real byte-length/encoding checks stay in src/witness/config.ts, unchanged). */
export function validateSecrets(
  secrets: Record<string, string | undefined>,
  bindings: Record<string, { required?: boolean; envVar?: string; validation?: { minLength?: number } }>,
  options: { enforceRequired?: boolean } = {}
): string[] {
  const errors: string[] = [];
  for (const [ref, binding] of Object.entries(bindings)) {
    const value = secrets[ref];
    if (value === undefined || value === '') {
      if (options.enforceRequired && binding.required) {
        errors.push(`secretRefs.${ref}: required secret is missing (source: ${binding.envVar ?? ref})`);
      }
      continue;
    }
    if (!options.enforceRequired) continue;
    const rule = binding.validation ?? {};
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push(`secretRefs.${ref}: too short (minimum ${rule.minLength} characters)`);
    }
  }
  return errors;
}
