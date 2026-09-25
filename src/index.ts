import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { startTaskRun } from "./engine/task-run.ts";
import { getTaskRun } from "./engine/task-runs.ts";
import { joeyHome } from "./engine/definitions.ts";
import { errMsg } from "./engine/logger.ts";

/**
 * `npm run start-run -- <slug>`: runs tasks/<slug>.yaml like the Start run button, prints the run id and folder, waits for the
 * run to finish and exits non-zero if it didn't complete.
 */
if (process.argv[2] === "start-run") {
  const slug = process.argv[3];
  if (!slug || !existsSync(resolve(joeyHome(), "tasks", `${slug}.yaml`))) {
    console.error(slug ? `no tasks/${slug}.yaml` : "usage: npm run start-run -- <task slug>");
    process.exit(1);
  }
  // Only Next.js reads .env.local on its own; settings are encrypted with SETTINGS_ENCRYPTION_KEY from it (existing env vars win).
  try {
    process.loadEnvFile(".env.local");
  } catch {}

  let runId: string;
  try {
    runId = startTaskRun(slug).runId;
  } catch (err) {
    console.error(errMsg(err));
    process.exit(1);
  }
  console.log(`${runId} ${getTaskRun(runId)!.runDir}`);
  let run = getTaskRun(runId)!;
  while (run.status === "running") {
    await new Promise((r) => setTimeout(r, 1000));
    run = getTaskRun(runId)!;
  }
  console.log(run.status + (run.errorMessage ? `: ${run.errorMessage}` : ""));
  process.exit(run.status === "completed" ? 0 : 1);
}
