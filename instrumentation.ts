export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("./src/engine/logger.ts");
  const { getMailAccount } = await import("./src/engine/settings.ts");
  const { inboxIntervalMs: pollMs } = await import("./src/engine/inbox-scheduler.ts");
  log("app").info({ logLevel: process.env.LOG_LEVEL ?? "info", logFile: process.env.LOG_FILE ?? "data/joey.log", mailAccount: getMailAccount(), inboxPollMs: pollMs() }, "joey started");
  const { markStaleRunsInterrupted } = await import("./src/engine/run-log.ts");
  markStaleRunsInterrupted();
  const { markStaleTaskRunsInterrupted } = await import("./src/engine/task-runs.ts");
  markStaleTaskRunsInterrupted();

  const { tickScheduler } = await import("./src/engine/scheduler.ts");
  setInterval(tickScheduler, 30_000);

  const { tickInbox, inboxIntervalMs } = await import("./src/engine/inbox-scheduler.ts");
  setInterval(() => void tickInbox(), inboxIntervalMs());
}
