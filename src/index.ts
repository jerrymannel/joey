import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getTask } from "./engine/task-board.ts";
import * as runLog from "./engine/run-log.ts";
import { runHarness } from "./engine/harness.ts";

/** Creates a run and kicks off the harness process in the background — does not wait for it to finish. */
export async function startRun(taskId: string): Promise<{ runId: string }> {
  const task = getTask(taskId);
  if (!task) throw new Error(`task ${taskId} not found`);

  const run = runLog.createRun(taskId);
  runLog.updateRunStatus(run.id, "running");

  runHarness(task, run.id)
    .then(() => runLog.updateRunStatus(run.id, "completed"))
    .catch((err) => runLog.updateRunStatus(run.id, "failed", { errorMessage: err instanceof Error ? err.message : String(err) }));

  return { runId: run.id };
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule && process.argv[2] === "start-run") {
  const taskId = process.argv[3];
  if (!taskId) {
    console.error("usage: node src/index.ts start-run <taskId>");
    process.exit(1);
  }
  const { runId } = await startRun(taskId);
  console.log(runId);
}
