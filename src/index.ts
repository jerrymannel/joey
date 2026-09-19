import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getTask } from "./engine/task-board.ts";
import * as runLog from "./engine/run-log.ts";
import { runHarness } from "./engine/harness.ts";
import { runAutomation } from "./engine/automation-run.ts";
import { claim, formatInbox, listResults, mailboxDir, scanInbox } from "./engine/mailbox.ts";

/**
 * Creates a run and kicks off the work in the background — does not wait for it to finish. A plain task runs
 * its harness; any INBOX messages addressed to it are claimed (renamed to DONE — the atomic claim, so none is
 * delivered twice, and none is retried if this run fails) and prepended to the prompt. A gmail/youtube
 * automation runs its own fetch/download instead (automation-run.ts) and takes no messages.
 */
export async function startRun(taskId: string): Promise<{ runId: string }> {
  const task = getTask(taskId);
  if (!task) throw new Error(`task ${taskId} not found`);

  const run = runLog.createRun(taskId);
  runLog.updateRunStatus(run.id, "running");

  let work: Promise<void>;
  if (task.service === "generic") {
    const dir = mailboxDir();
    const delivered = claim(dir, scanInbox(dir).filter((m) => m.to === taskId));
    if (delivered.length > 0) {
      runLog.appendRunOutput(run.id, `Delivered ${delivered.length} inbox message(s): ${delivered.map((m) => m.file).join(", ")}\n`);
    }
    const inbox = formatInbox(delivered, (id) => getTask(id)?.name ?? id);
    work = runHarness({ ...task, prompt: inbox + task.prompt }, run.id).then(() => {
      if (!listResults(dir).some((r) => r.run === run.id)) runLog.appendRunOutput(run.id, "Note: the agent did not send a result.\n");
    });
  } else {
    work = runAutomation(task, run.id);
  }

  work
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
