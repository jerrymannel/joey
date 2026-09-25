import { listTasks } from "./task-board.ts";
import { listRuns } from "./run-log.ts";
import { cronMatches } from "./cron.ts";
import { startRun } from "../index.ts";
import { errMsg, log } from "./logger.ts";
import { listTaskFiles } from "./definitions.ts";
import { hasActiveRun, isPaused } from "./task-runs.ts";
import { startTaskRun } from "./task-run.ts";

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
    log("scheduler").info({ taskId: task.id, schedule: task.schedule }, "schedule matched, starting a run");
    startRun(task.id).catch((err) => log("scheduler").error({ taskId: task.id, err: errMsg(err) }, "couldn't start the scheduled run"));
  }
  tickTaskSchedules(now);
}

/** Starts a run of every valid, unpaused `tasks/*.yaml` whose schedule matches `now` and that isn't already running. */
export function tickTaskSchedules(now: Date): void {
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
