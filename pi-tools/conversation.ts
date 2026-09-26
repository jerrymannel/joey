import { appendFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Appends an entry to the run's shared `conversation.md` (in RUN_DIR) — the log agents leave for each other and for later review.
 * Runs in pi's process, so RUN_DIR and JOEY_AGENT come from the env task-run.ts exported into the agent's shell.
 */
export function appendConversation(kind: string, body: string): string {
  const runDir = process.env.RUN_DIR;
  if (!runDir) throw new Error("this tool only works inside a Joey task run");
  const agent = process.env.JOEY_AGENT || "agent";
  const file = join(runDir, "conversation.md");
  appendFileSync(/* turbopackIgnore: true */ file, `\n## ${agent} · ${new Date().toISOString()} · ${kind}\n\n${body.trim()}\n`);
  return file;
}
