import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { startTaskRun } from "./engine/task-run.ts";
import { getTaskRun } from "./engine/task-runs.ts";
import { joeyHome } from "./engine/definitions.ts";
import { fileURLToPath } from "node:url";
import { getTask } from "./engine/task-board.ts";
import * as runLog from "./engine/run-log.ts";
import { runHarness } from "./engine/harness.ts";
import { runAutomation } from "./engine/automation-run.ts";
import { claim, formatInbox, listResults, resultsDir, scanInbox, type Mail } from "./engine/mailbox.ts";
import { getMailAccount } from "./engine/settings.ts";
import { errMsg, log } from "./engine/logger.ts";

const rlog = log("run");

/** Unread mail addressed to this job, marked read (= handed to the run). Never throws: a mail problem must not stop the run. */
async function claimInbox(taskId: string, runId: string): Promise<Mail[]> {
  if (!getMailAccount()) return [];
  try {
    const delivered = await claim((await scanInbox()).filter((m) => m.jobId === taskId));
    if (delivered.length > 0) runLog.appendRunOutput(runId, `Delivered ${delivered.length} inbox message(s): ${delivered.map((m) => m.subject || m.id).join(", ")}\n`);
    return delivered;
  } catch (err) {
    rlog.error({ taskId, runId, err: errMsg(err) }, "could not read the inbox; running without mail");
    runLog.appendRunOutput(runId, `Could not read the inbox: ${errMsg(err)}\n`);
    return [];
  }
}

/**
 * Creates a run and kicks off the work in the background — does not wait for it to finish. A plain task first
 * claims any unread mail addressed to it (marked read, so none is delivered twice and none is retried if this run
 * fails) and prepends it to the prompt, then runs its harness. A gmail/youtube automation runs its own
 * fetch/download instead (automation-run.ts) and takes no mail.
 */
export async function startRun(taskId: string): Promise<{ runId: string }> {
  const task = getTask(taskId);
  if (!task) throw new Error(`task ${taskId} not found`);

  const run = runLog.createRun(taskId);
  runLog.updateRunStatus(run.id, "running");
  rlog.info({ taskId, runId: run.id, name: task.name, service: task.service, harness: task.harness }, "run started");

  let work: Promise<void>;
  if (task.service === "generic") {
    work = (async () => {
      const delivered = await claimInbox(taskId, run.id);
      const inbox = formatInbox(delivered, (id) => getTask(id)?.name);
      // MAIL_HOPS lets a pi run's mailbox_send_message know how deep in a mail chain it is (loop guard).
      const mailHops = delivered.length > 0 ? Math.max(...delivered.map((m) => m.hops)) : undefined;
      await runHarness({ ...task, prompt: inbox + task.prompt }, run.id, mailHops);
      if (!listResults(resultsDir()).some((r) => r.run === run.id)) {
        rlog.warn({ taskId, runId: run.id }, "the agent finished without calling mailbox_send_result — no result was filed");
        runLog.appendRunOutput(run.id, "Note: the agent did not send a result.\n");
      }
    })();
  } else {
    work = runAutomation(task, run.id);
  }

  work
    .then(() => {
      runLog.updateRunStatus(run.id, "completed");
      rlog.info({ taskId, runId: run.id }, "run completed");
    })
    .catch((err) => {
      runLog.updateRunStatus(run.id, "failed", { errorMessage: errMsg(err) });
      rlog.error({ taskId, runId: run.id, err: errMsg(err) }, "run failed");
    });

  return { runId: run.id };
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule && process.argv[2] === "start-run") {
  // Only Next.js reads .env.local on its own; settings are encrypted with SETTINGS_ENCRYPTION_KEY from it (existing env vars win).
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  const id = process.argv[3];
  if (!id) {
    console.error("usage: npm run start-run -- <task slug | old task id>");
    process.exit(1);
  }
  // A tasks/<slug>.yaml task (docs/redesign.md) prints its run folder, waits for the run and exits non-zero if it failed; an old task id runs the old way.
  if (existsSync(resolve(joeyHome(), "tasks", `${id}.yaml`))) {
    let runId: string;
    try {
      runId = startTaskRun(id).runId;
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
  } else {
    const { runId } = await startRun(id);
    console.log(runId);
  }
}
