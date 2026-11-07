export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("./src/engine/logger.ts");
  log("app").info({ logLevel: process.env.LOG_LEVEL ?? "info", logFile: process.env.LOG_FILE ?? "data/joey.log" }, "joey started");
  const { markStaleTaskRunsInterrupted } = await import("./src/engine/task-runs.ts");
  markStaleTaskRunsInterrupted();
  const { ensureTaskFolders } = await import("./src/engine/task-run.ts");
  try {
    const created = ensureTaskFolders();
    if (created.length) log("app").info({ created }, "created task folders");
  } catch (err) {
    const { errMsg } = await import("./src/engine/logger.ts");
    log("app").warn({ err: errMsg(err) }, "couldn't create task folders");
  }

  const { tickScheduler } = await import("./src/engine/scheduler.ts");
  setInterval(() => tickScheduler(), 30_000);
}
