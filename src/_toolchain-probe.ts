/**
 * TOOLCHAIN VERIFICATION PROBE — Phase 18-D / Stage 1.
 *
 * This file exists only to prove the TypeScript toolchain (tsc, tsconfig,
 * @types/node, module resolution) works end-to-end. It is deliberately NOT
 * domain-shaped (no STH/witness/crypto types) so it cannot be mistaken for
 * the start of the real migration, which begins in a later stage with
 * src/protocol/, src/crypto/, etc.
 *
 * Not imported by scripts/sign-sth.js, not imported by any test, not part
 * of any build artifact that runs in production.
 */

import { canonicalize } from 'json-canonicalize';
import { platform } from 'node:os';

// Proves @types/node resolves (node:os is a Node builtin, not a package).
export function describeRuntime(): string {
  return `node-${platform()}`;
}

// Proves json-canonicalize resolves and its types are usable under NodeNext
// + esModuleInterop with the package's current (CommonJS-default) package.json.
export function canonicalProbePayload(value: unknown): string {
  return canonicalize(value as object);
}

// Proves strict + noUncheckedIndexedAccess: without the `?? 0` fallback,
// this would be a compile error (arr[i] is `number | undefined` here).
export function sumFirstTwo(arr: number[]): number {
  return (arr[0] ?? 0) + (arr[1] ?? 0);
}

// Proves exactOptionalPropertyTypes: `label` must be omitted entirely to
// satisfy this type — assigning `label: undefined` explicitly would fail.
interface ProbeOptions {
  label?: string;
}

export function describeOptions(opts: ProbeOptions): string {
  return opts.label ?? '(no label)';
}
