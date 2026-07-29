/**
 * Type declaration for run-witness.js -- describes shape only.
 */

export interface WitnessScriptResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function runWitnessScript(env?: Record<string, string>): Promise<WitnessScriptResult>;
export const REPO_ROOT: string;
export const ENTRYPOINT: string;
