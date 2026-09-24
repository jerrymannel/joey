import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Task } from "./task-board.ts";
import { appendRunOutput } from "./run-log.ts";
import { listTools } from "./tools.ts";
import { getModelByValue, piModelRef } from "./models.ts";
import * as herdr from "./herdr.ts";
import { runPiInHerdr, describePiRun } from "./pi-herdr.ts";
import { deliverResult, ref, resultsDir } from "./mailbox.ts";
import { log } from "./logger.ts";
import { promptFile } from "./prompt-files.ts";

const hlog = log("harness");
const { shellQuote } = herdr;

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

/**
 * MCP servers (e.g. chrome-devtools) for pi runs, via the pi-mcp-adapter package (`pi install npm:pi-mcp-adapter`
 * — not built into pi itself). Same absolute-path reasoning as PI_TOOLS_EXTENSION: pi's cwd is the task's own
 * folder, so the adapter would never find a project-root `.mcp.json` on its own.
 */
const PI_MCP_CONFIG = resolve(process.cwd(), ".mcp.json");

/** thinkingLevel/trustFolder are pi-only options (see task-board.ts) — exact flag syntax pending confirmation against the real pi CLI. */
export function buildArgs(task: Task): string[] {
  const args = [...splitArgs(task.cliParams), "-p", withTools(task)];
  // pi can't take a base URL, so a custom-endpoint model is passed as the provider/id it's registered under (see pi-herdr.ts).
  const piCustom = task.harness === "pi" && task.model ? getModelByValue(task.model) : undefined;
  if (task.model) args.push("--model", piCustom?.endpoint ? piModelRef(piCustom) : task.model);
  if (task.harness === "pi") {
    args.push("--extension", PI_TOOLS_EXTENSION);
    if (existsSync(PI_MCP_CONFIG)) args.push("--mcp-config", PI_MCP_CONFIG);
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
 * that sentinel to report the exit code back, tab close), not just the `pi ...` line itself; every
 * other harness goes through the same herdr sequence (see `runCliInHerdr`). For display only,
 * nothing is run. Mirrors youtube-download.ts's `describeDownloadCommands`.
 */
export function describeRun(task: Task): { cwd: string; commands: string[] } {
  if (task.harness === "pi") return describePiRun(task, buildArgs(task));
  const command = cliCommand(task, buildArgs(task), "<stdout-file>", "<stderr-file>");
  return {
    cwd: task.folderPath,
    commands: [
      herdr.describeCreateTab(task.folderPath, `${task.harness}:${task.id}`),
      "",
      ...herdr.describeRunInPane(command, "HERDR_DONE_PREVIEW"),
      "",
      herdr.describeCloseTab(),
    ],
  };
}

/** Env vars ahead of the command line, typed into the herdr pane's own shell (see pi-herdr.ts's envPrefix for the same reason). */
function envPrefix(task: Task): string {
  const vars: string[] = [];
  if (task.model) vars.push(`MODEL=${shellQuote(task.model)}`);
  const endpoint = task.model ? getModelByValue(task.model)?.endpoint : undefined;
  if (endpoint) vars.push(`ANTHROPIC_BASE_URL=${shellQuote(endpoint)}`);
  return vars.map((v) => `${v} `).join("");
}

/** The pane command for a non-pi harness: its stdout is teed to `stdoutFile` (it's the agent's result), its stderr kept in `stderrFile`. */
function cliCommand(task: Task, args: string[], stdoutFile: string, stderrFile: string): string {
  const line = [task.harness, ...args].map(shellQuote).join(" ");
  return herdr.bashPipeline(`${envPrefix(task)}${line} 2> ${shellQuote(stderrFile)} | tee ${shellQuote(stdoutFile)}`);
}

/** Runs a non-pi harness in a herdr tab, cwd'd to the task's folder. Its stdout (the agent's answer) is filed and emailed as the result — these CLIs can't call mailbox_send_result — and, with stderr, copied into the run log when it exits. */
async function runCliInHerdr(task: Task, args: string[], runId: string): Promise<void> {
  const scratch = mkdtempSync(join(tmpdir(), "joey-run-"));
  const [stdoutFile, stderrFile] = [join(scratch, "stdout"), join(scratch, "stderr")];
  const read = (file: string) => (existsSync(file) ? readFileSync(/* turbopackIgnore: true */ file, "utf8") : "");
  const command = cliCommand(task, args, stdoutFile, stderrFile);
  appendRunOutput(runId, `$ ${command}\n`);
  try {
    const { exitCode, timedOut } = await herdr.runInTab(task.folderPath, `${task.harness}:${task.id}`, command);
    const [stdout, stderr] = [read(stdoutFile), read(stderrFile)];
    appendRunOutput(runId, stdout + stderr);
    const fields = { taskId: task.id, runId, harness: task.harness, exitCode, timedOut };
    if (timedOut || exitCode !== 0) {
      hlog.error(fields, "harness failed");
      throw new Error(timedOut ? `${task.harness} timed out` : `${task.harness} exited with code ${exitCode}`);
    }
    hlog.info(fields, "harness exited cleanly");
    const { emailed, emailError } = await deliverResult(resultsDir(), { taskId: task.id, from: ref(task.name, task.id), run: runId, subject: `${task.name} — result`, body: stdout });
    if (!emailed) appendRunOutput(runId, `Note: the result was filed but not emailed (${emailError}).\n`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Runs the task's harness CLI with its prompt/model/options in a herdr tab (visible/inspectable like the YouTube downloader's jobs): "pi" via pi-herdr.ts, every other harness via `runCliInHerdr`. */
export function runHarness(task: Task, runId: string, mailHops?: number): Promise<void> {
  if (UNIMPLEMENTED_HARNESSES.has(task.harness)) {
    return Promise.reject(new Error(`harness "${task.harness}" is not implemented yet`));
  }

  const args = buildArgs(task);
  hlog.debug({ taskId: task.id, runId, harness: task.harness, cwd: task.folderPath, args }, "harness command");

  if (task.harness === "pi") {
    return runPiInHerdr(task, args, runId, mailHops);
  }

  return runCliInHerdr(task, args, runId);
}
