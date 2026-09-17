import { listTasks } from "./task-board.ts";
import { listRuns } from "./run-log.ts";
import { cronMatches } from "./cron.ts";
import { startRun } from "../index.ts";

let lastCheckedMinute = "";

/** Called on an interval (see instrumentation.ts) — starts a run for any task whose schedule matches the current minute. */
export function tickScheduler(): void {
  const now = new Date();
  const minuteKey = now.toISOString().slice(0, 16);
  if (minuteKey === lastCheckedMinute) return;
  lastCheckedMinute = minuteKey;

  for (const task of listTasks()) {
    if (!task.schedule || !cronMatches(task.schedule, now)) continue;
    const alreadyActive = listRuns(task.id).some((r) => r.status === "pending" || r.status === "running");
    if (alreadyActive) continue;
    startRun(task.id).catch(() => {});
  }
}
