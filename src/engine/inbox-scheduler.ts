import { getTask } from "./task-board.ts";
import { getRun, listRuns } from "./run-log.ts";
import { pickNext, scanInbox, warnOnce } from "./mailbox.ts";
import { getMailAccount } from "./settings.ts";
import { errMsg, log } from "./logger.ts";
import { startRun } from "../index.ts";

/** How often the agent inbox is polled — `MAILBOX_TIMER` seconds, default 30 (it's a network call now). */
export function inboxIntervalMs(): number {
  return (Number(process.env.MAILBOX_TIMER) || 30) * 1000;
}

/** The run the last inbox trigger started; the next agent isn't triggered until it has finished. */
let activeTrigger: string | null = null;
let polling = false;
const ilog = log("inbox");

/**
 * Called on an interval (see instrumentation.ts). Triggers at most one agent per tick: the recipient of
 * the oldest unread mail whose task has no active run. While an inbox-triggered run is still going,
 * nothing else is triggered — mail stays unread and the next tick after it ends picks it up.
 */
export async function tickInbox(): Promise<void> {
  if (polling || !getMailAccount()) return;

  if (activeTrigger) {
    const status = getRun(activeTrigger)?.status;
    if (status === "pending" || status === "running") return ilog.trace({ activeTrigger, status }, "waiting for the triggered run to finish");
    ilog.debug({ activeTrigger, status }, "triggered run finished");
    activeTrigger = null;
  }

  polling = true;
  try {
    const next = pickNext(await scanInbox(), (id) => {
      if (getTask(id)?.service !== "generic") return "unknown"; // automations have no agent to hand mail to
      return listRuns(id).some((r) => r.status === "pending" || r.status === "running") ? "busy" : "yes";
    });
    if (next) {
      activeTrigger = (await startRun(next)).runId;
      ilog.info({ taskId: next, runId: activeTrigger }, "mail triggered a run");
    }
  } catch (err) {
    const message = errMsg(err);
    warnOnce(`poll:${message}`, `inbox poll failed: ${message}`, "error");
  } finally {
    polling = false;
  }
}
