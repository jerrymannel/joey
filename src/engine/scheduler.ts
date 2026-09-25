import { cronMatches } from "./cron.ts";
import { errMsg, log } from "./logger.ts";
import { listTaskFiles } from "./definitions.ts";
import { hasActiveRun, isPaused } from "./task-runs.ts";
import { startTaskRun } from "./task-run.ts";

let lastCheckedMinute = "";

/** Called every 30s (instrumentation.ts): once per minute, starts a run of every valid, unpaused tasks/*.yaml whose schedule matches and that isn't already running. */
export function tickScheduler(now = new Date()): void {
  const minuteKey = now.toISOString().slice(0, 16);
  if (minuteKey === lastCheckedMinute) return;
  lastCheckedMinute = minuteKey;

  for (const { slug, task } of listTaskFiles()) {
    if (!task?.schedule || !cronMatches(task.schedule, now) || isPaused(slug) || hasActiveRun(slug)) continue;
    log("scheduler").info({ slug, schedule: task.schedule }, "schedule matched, starting a run");
    try {
      startTaskRun(slug);
    } catch (err) {
      log("scheduler").error({ slug, err: errMsg(err) }, "couldn't start the scheduled run");
    }
  }
}
