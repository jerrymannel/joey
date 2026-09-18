import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { Task } from "./task-board.ts";
import { appendRunOutput } from "./run-log.ts";
import { listTools } from "./tools.ts";
import { getModelByValue } from "./models.ts";
import { runPiInHerdr, describePiRun } from "./pi-herdr.ts";

/** Harnesses without a real CLI integration yet — see task-board.ts's HARNESSES. */
const UNIMPLEMENTED_HARNESSES = new Set<Task["harness"]>(["adk"]);

function splitArgs(cliParams: string): string[] {
  return cliParams.trim() ? cliParams.trim().split(/\s+/) : [];
}

/** Prepends the enabled tools' names/descriptions to the prompt — there's no real tool-calling loop yet, so this is the only way the harness process learns about them. */
function withTools(task: Task): string {
  if (task.toolIds.length === 0) return task.prompt;
  const enabled = listTools().filter((t) => task.toolIds.includes(t.id));
  if (enabled.length === 0) return task.prompt;
  const list = enabled.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return `Available tools:\n${list}\n\n${task.prompt}`;
}

/** Real, callable tools for pi (search/read email, list/show playlist) — see pi-tools/index.ts. Loaded from an absolute path since pi runs cwd'd to the task's own folder, not this repo. */
const PI_TOOLS_EXTENSION = resolve(process.cwd(), "pi-tools/index.ts");

/** thinkingLevel/trustFolder are pi-only options (see task-board.ts) — exact flag syntax pending confirmation against the real pi CLI. */
export function buildArgs(task: Task): string[] {
  const args = [...splitArgs(task.cliParams), "-p", withTools(task)];
  if (task.model) args.push("--model", task.model);
  if (task.harness === "pi") {
    args.push("--extension", PI_TOOLS_EXTENSION);
    if (task.thinkingLevel) args.push("--thinking-level", task.thinkingLevel);
    if (task.trustFolder) args.push("--dangerously-skip-permissions");
  }
  return args;
}

function quote(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/** Human-readable preview of the command a run of this task would execute — for display only, nothing is run. */
export function describeCommand(task: Task): string {
  return [task.harness, ...buildArgs(task).map(quote)].join(" ");
}

/**
 * Human-readable preview of the *complete* sequence a real run would go through — for pi, that's
 * every herdr command (tab creation, the pi invocation with its completion sentinel, waiting for
 * that sentinel to report the exit code back, tab close), not just the `pi ...` line itself; for
 * every other harness it's the single command `runHarness` spawns directly. For display only,
 * nothing is run. Mirrors youtube-download.ts's `describeDownloadCommands`.
 */
export function describeRun(task: Task): { cwd: string; commands: string[] } {
  if (task.harness === "pi") return describePiRun(task, buildArgs(task));
  return { cwd: task.folderPath, commands: [describeCommand(task)] };
}

function envForTask(task: Task): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (task.model) env.MODEL = task.model;
  const endpoint = task.model ? getModelByValue(task.model)?.endpoint : undefined;
  if (endpoint) env.ANTHROPIC_BASE_URL = endpoint;
  return env;
}

/** Runs the task's harness CLI with its prompt/model/options, streaming output into the run's log. "pi" runs inside a herdr tab instead (see pi-herdr.ts) so it's visible/inspectable the same way the YouTube downloader's jobs are. */
export function runHarness(task: Task, runId: string): Promise<void> {
  if (UNIMPLEMENTED_HARNESSES.has(task.harness)) {
    return Promise.reject(new Error(`harness "${task.harness}" is not implemented yet`));
  }

  const args = buildArgs(task);

  if (task.harness === "pi") {
    return runPiInHerdr(task, args, runId);
  }

  return new Promise((resolvePromise, reject) => {
    const child = spawn(task.harness, args, { cwd: task.folderPath, env: envForTask(task) });

    child.stdout.on("data", (chunk: Buffer) => appendRunOutput(runId, chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => appendRunOutput(runId, chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${task.harness} exited with code ${code}`));
    });
  });
}
