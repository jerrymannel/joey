export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { markStaleRunsInterrupted } = await import("./src/engine/run-log.ts");
  markStaleRunsInterrupted();

  const { tickScheduler } = await import("./src/engine/scheduler.ts");
  setInterval(tickScheduler, 30_000);
}
