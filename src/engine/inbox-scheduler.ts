import { getTask } from "./task-board.ts";
import { getRun, listRuns } from "./run-log.ts";
import { mailboxDir, pickNext, scanInbox } from "./mailbox.ts";
import { startRun } from "../index.ts";

/** How often the inbox is scanned — `MAILBOX_TIMER` seconds, default 10. */
export function inboxIntervalMs(): number {
  return (Number(process.env.MAILBOX_TIMER) || 10) * 1000;
}

/** The run the last inbox trigger started; the next agent isn't triggered until it has finished. */
let activeTrigger: string | null = null;

/**
 * Called on an interval (see instrumentation.ts). Triggers at most one agent per tick: the recipient of
 * the oldest pending message whose task has no active run. While an inbox-triggered run is still going,
 * nothing else is triggered — messages stay in INBOX and the next tick after it ends picks them up.
 */
export function tickInbox(): void {
  const dir = mailboxDir();

  if (activeTrigger) {
    const status = getRun(activeTrigger)?.status;
    if (status === "pending" || status === "running") return;
    activeTrigger = null;
  }

  const next = pickNext(scanInbox(dir), (id) => {
    if (getTask(id)?.service !== "generic") return "unknown"; // automations have no agent to hand a message to
    return listRuns(id).some((r) => r.status === "pending" || r.status === "running") ? "busy" : "yes";
  });
  if (!next) return;

  startRun(next)
    .then(({ runId }) => (activeTrigger = runId))
    .catch((err) => console.warn(`[mailbox] failed to start ${next}:`, err));
}
