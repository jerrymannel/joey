import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * What a script gets from Joey (docs/redesign.md): run as `tsx scripts/<name>/app.ts` in a herdr tab with RUN_DIR, TASK_DIR, STEP_INPUT (the
 * previous step's output file, absent for step 1), STEP_OUTPUT (the file to write this step's output to) and JOEY_PARAMS (the step's params,
 * JSON). stdout/stderr land in the run log; exit 0 = success. The engine reads credentials from the databases, which needs
 * SETTINGS_ENCRYPTION_KEY — loaded here from the repo's .env.local, since the herdr pane's shell never saw it.
 */
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch {}

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — scripts are run by Joey (npm run start-run -- <task>)`);
  return value;
}

export const runDir = need("RUN_DIR");
export const taskDir = need("TASK_DIR");
export const params: Record<string, unknown> = JSON.parse(process.env.JOEY_PARAMS ?? "{}");

export function param(name: string): string | undefined {
  const v = params[name];
  return v === undefined || v === null ? undefined : String(v);
}

/** This step's output — what the next step receives. */
export function output(text: string): void {
  writeFileSync(need("STEP_OUTPUT"), text);
}
