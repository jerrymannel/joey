import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { Task } from "./task-board.ts";
import { appendRunOutput } from "./run-log.ts";
import { listTools } from "./tools.ts";
import { getModelByValue, piModelRef } from "./models.ts";
import { runPiInHerdr, describePiRun } from "./pi-herdr.ts";
import { deliverResult, ref, resultsDir } from "./mailbox.ts";
import { log } from "./logger.ts";
import { promptFile } from "./prompt-files.ts";

const hlog = log("harness");

/** Harnesses without a real CLI integration yet — see task-board.ts's HARNESSES. */
const UNIMPLEMENTED_HARNESSES = new Set<Task["harness"]>(["adk"]);

function splitArgs(cliParams: string): string[] {
  return cliParams.trim() ? cliParams.trim().split(/\s+/) : [];
}

/**
 * The prompt handed to the harness: the enabled tools' names/descriptions prepended (there's no real tool-calling loop
 * for non-pi harnesses, so this is the only way they learn about them), and for pi the mailbox instruction appended
 * (prompts/mailbox-instruction.md). pi is the only harness that can call the mailbox tools (pi-tools/mailbox_send_message.ts,
 * mailbox_list_agents.ts, mailbox_send_result.ts); the others' stdout is emailed as their result by `runHarness`. The mailbox tools
 * are always on and described by that instruction, so they're never listed under the tools heading.
 */
function withTools(task: Task): string {
  const enabled = listTools().filter((t) => !t.alwaysOn && task.toolIds.includes(t.id));
  const tools = enabled.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const prompt = enabled.length > 0 ? `${promptFile("tools", { tools })}\n\n${task.prompt}` : task.prompt;
  return task.harness === "pi" ? `${prompt}\n\n${promptFile("mailbox-instruction")}` : prompt;
}

/** Real, callable tools for pi (search/read email, list/show playlist) — see pi-tools/index.ts. Loaded from an absolute path since pi runs cwd'd to the task's own folder, not this repo. */
const PI_TOOLS_EXTENSION = resolve(process.cwd(), "pi-tools/index.ts");

/** thinkingLevel/trustFolder are pi-only options (see task-board.ts) — exact flag syntax pending confirmation against the real pi CLI. */
export function buildArgs(task: Task): string[] {
  const args = [...splitArgs(task.cliParams), "-p", withTools(task)];
  // pi can't take a base URL, so a custom-endpoint model is passed as the provider/id it's registered under (see pi-herdr.ts).
  const piCustom = task.harness === "pi" && task.model ? getModelByValue(task.model) : undefined;
  if (task.model) args.push("--model", piCustom?.endpoint ? piModelRef(piCustom) : task.model);
  if (task.harness === "pi") {
    args.push("--extension", PI_TOOLS_EXTENSION);
    if (task.thinkingLevel) args.push("--thinking", task.thinkingLevel);
    if (task.trustFolder) args.push("--approve");
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

/** Runs the task's harness CLI with its prompt/model/options, streaming output into the run's log. "pi" runs inside a herdr tab instead (see pi-herdr.ts) so it's visible/inspectable the same way the YouTube downloader's jobs are; every other harness's stdout is filed in the results folder when it exits cleanly. */
export function runHarness(task: Task, runId: string, mailHops?: number): Promise<void> {
  if (UNIMPLEMENTED_HARNESSES.has(task.harness)) {
    return Promise.reject(new Error(`harness "${task.harness}" is not implemented yet`));
  }

  const args = buildArgs(task);
  hlog.debug({ taskId: task.id, runId, harness: task.harness, cwd: task.folderPath, args }, "harness command");

  if (task.harness === "pi") {
    return runPiInHerdr(task, args, runId, mailHops);
  }

  return new Promise((resolvePromise, reject) => {
    const child = spawn(task.harness, args, { cwd: task.folderPath, env: envForTask(task) });
    let stdout = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      appendRunOutput(runId, chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer) => appendRunOutput(runId, chunk.toString()));
    child.on("error", (err) => {
      hlog.error({ taskId: task.id, runId, harness: task.harness, err: err.message }, "couldn't spawn the harness");
      reject(err);
    });
    child.on("close", (code) => {
      const fields = { taskId: task.id, runId, harness: task.harness, code };
      if (code === 0) hlog.info(fields, "harness exited cleanly");
      else hlog.error(fields, "harness exited with an error");
      if (code !== 0) return reject(new Error(`${task.harness} exited with code ${code}`));
      // These CLIs can't call mailbox_send_result, so their stdout is the agent's output: filed and emailed as the result.
      deliverResult(resultsDir(), { taskId: task.id, from: ref(task.name, task.id), run: runId, subject: `${task.name} — result`, body: stdout })
        .then(({ emailed, emailError }) => {
          if (!emailed) appendRunOutput(runId, `Note: the result was filed but not emailed (${emailError}).\n`);
          resolvePromise();
        })
        .catch(reject);
    });
  });
}
