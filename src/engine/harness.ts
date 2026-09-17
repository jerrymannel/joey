import { spawn } from "node:child_process";
import type { Task } from "./task-board.ts";
import { appendRunOutput } from "./run-log.ts";

/** Harnesses without a real CLI integration yet — see task-board.ts's HARNESSES. */
const UNIMPLEMENTED_HARNESSES = new Set<Task["harness"]>(["adk"]);

function splitArgs(cliParams: string): string[] {
  return cliParams.trim() ? cliParams.trim().split(/\s+/) : [];
}

function buildArgs(task: Task): string[] {
  const args = [...splitArgs(task.cliParams), "-p", task.prompt];
  if (task.model) args.push("--model", task.model);
  return args;
}

function quote(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/** Human-readable preview of the command a run of this task would execute — for display only, nothing is run. */
export function describeCommand(task: Task): string {
  return [task.harness, ...buildArgs(task).map(quote)].join(" ");
}

/** Spawns the task's harness CLI with its prompt and model, streaming output into the run's log. */
export function runHarness(task: Task, runId: string): Promise<void> {
  if (UNIMPLEMENTED_HARNESSES.has(task.harness)) {
    return Promise.reject(new Error(`harness "${task.harness}" is not implemented yet`));
  }

  const args = buildArgs(task);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(task.harness, args, {
      cwd: task.folderPath,
      env: task.model ? { ...process.env, MODEL: task.model } : process.env,
    });

    child.stdout.on("data", (chunk: Buffer) => appendRunOutput(runId, chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => appendRunOutput(runId, chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${task.harness} exited with code ${code}`));
    });
  });
}
