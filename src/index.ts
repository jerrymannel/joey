import { resolve } from "node:path";
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
  const taskId = process.argv[3];
  if (!taskId) {
    console.error("usage: node src/index.ts start-run <taskId>");
    process.exit(1);
  }
  const { runId } = await startRun(taskId);
  console.log(runId);
}
