import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as herdr from "./herdr.ts";
import { appendRunOutput } from "./run-log.ts";
import { listModels, piProviderName } from "./models.ts";
import type { Task } from "./task-board.ts";
import { resultsDir } from "./mailbox.ts";
import { dataDbPath, settingsDbPath } from "./db.ts";
import { log } from "./logger.ts";

const plog = log("pi");

function herdrTabLabel(taskId: string): string {
  return `pi:${taskId}`;
}

/** Env vars set ahead of the command rather than passed to execFile, since the command is typed into an already-running herdr pane's shell, not spawned directly by us. */
function envPrefix(task: Task, runId: string, mailHops?: number): string {
  const parts: string[] = [];
  // pi-tools/index.ts (loaded via --extension, see harness.ts) calls into db.ts, which resolves
  // data/data.db and data/settings.db relative to process.cwd() — but the herdr pane below is cwd'd to the
  // task's own folder, not this repo, so without these the tools would look for databases that aren't there.
  parts.push(`DATA_DB_PATH=${herdr.shellQuote(dataDbPath())} SETTINGS_DB_PATH=${herdr.shellQuote(settingsDbPath())}`);
  // pi-tools/mailbox_send_message.ts and mailbox_send_result.ts run in that same separate process: they need the results
  // folder, who "from" is, which run a result belongs to, and how deep in a mail chain this run is.
  parts.push(`PROMPTS_DIR=${herdr.shellQuote(resolve(/* turbopackIgnore: true */ process.env.PROMPTS_DIR ?? resolve(/* turbopackIgnore: true */ process.cwd(), "prompts")))}`); // sendMail (in pi's process) reads prompts/sender-prompt.md
  parts.push(`RESULTS_DIR=${herdr.shellQuote(resultsDir())}`);
  // pi's tools log to the same file as the app, from another process: no console sink (it's pi's terminal), an absolute path.
  parts.push(`LOG_CONSOLE=off LOG_FILE=${herdr.shellQuote(resolve(/* turbopackIgnore: true */ process.cwd(), process.env.LOG_FILE ?? "data/joey.log"))}`);
  parts.push(`TASK_ID=${herdr.shellQuote(task.id)}`);
  parts.push(`RUN_ID=${herdr.shellQuote(runId)}`);
  if (mailHops !== undefined) parts.push(`MAIL_HOPS=${mailHops}`);
  return `${parts.join(" ")} `;
}

/**
 * pi has no flag or env var for a base URL — a custom endpoint only works as a provider registered in
 * ~/.pi/agent/models.json (https://pi.dev/docs/latest/models). So before each run, rewrite the `joey-*`
 * providers there from the models table (one per custom-endpoint model, since baseUrl is per provider)
 * and leave every other provider in the file alone. `harness.ts` then passes `--model joey-<id>/<value>`.
 *
 * ponytail: assumes the endpoint speaks OpenAI Chat Completions (llama.cpp, vLLM, Ollama, LM Studio all
 * do) with no auth; add an API-type / API-key field to the model form if one that doesn't shows up.
 */
export function syncPiCustomModels(): void {
  const path = join(homedir(), ".pi/agent/models.json");
  let config: { providers?: Record<string, unknown> } = {};
  try {
    config = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // missing file (or unparsable — nothing worth preserving) → start fresh
  }
  const providers = Object.fromEntries(Object.entries(config.providers ?? {}).filter(([name]) => !name.startsWith("joey-")));
  for (const model of listModels().filter((m) => m.endpoint)) {
    providers[piProviderName(model)] = {
      baseUrl: model.endpoint,
      api: "openai-completions",
      apiKey: "joey", // placeholder — pi treats keyless models as unavailable, local servers ignore it
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
      models: [{ id: model.value, name: model.name }],
    };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ...config, providers }, null, 2));
}

/** Pipes `line`'s stdout (pi's `--mode json` event stream) to `jsonFile` and its stderr to `stderrFile`, so a real run can read them back afterwards — wrapped in `bash -c` with pipefail so the reported exit code is pi's own, not tee's. */
function piPipeline(line: string, jsonFile: string, stderrFile: string): string {
  return herdr.bashPipeline(`${line} 2> ${herdr.shellQuote(stderrFile)} | tee ${herdr.shellQuote(jsonFile)}`);
}

/** Where a run's prompt is written before typing the pi command — see `piCommandViaPromptFile`'s own comment for why. */
function promptFilePath(task: Task, runId: string): string {
  return join(task.folderPath, `.joey-prompt-${runId}.txt`);
}

/**
 * The real `pi ...` invocation, env prefix included, but with the prompt (the value right after `-p`) read from `promptPath` via
 * `$(cat ...)` instead of typed inline (a prompt is often long and multi-line; typing it as one giant quoted
 * argument leaves bash sitting at its `>` continuation prompt mid-command, which herdr's pane-typing doesn't
 * recognize as "still delivering the command" — it resends the whole line, compounding duplicate text into the
 * still-open quote until a stray `(` breaks out of quoting and bash errors), and piped through `piPipeline` so
 * its `--mode json` output is captured to `jsonFile`/`stderrFile` for `formatPiTranscript` to read back.
 */
function piCommandViaPromptFile(task: Task, args: string[], runId: string, promptPath: string, jsonFile: string, stderrFile: string, mailHops?: number): string {
  const line = ["pi", ...args]
    .map((arg, i, all) => (all[i - 1] === "-p" ? `"$(cat ${herdr.shellQuote(promptPath)})"` : herdr.shellQuote(arg)))
    .join(" ");
  return envPrefix(task, runId, mailHops) + piPipeline(line, jsonFile, stderrFile);
}

/** One assistant/toolResult content array (text, tool calls, tool output) rendered as plain text for the run log. */
function formatPiContent(content: { type: string; text?: string; name?: string; arguments?: unknown }[]): string {
  return content
    .map((c) => (c.type === "text" ? c.text : c.type === "toolCall" ? `→ ${c.name}(${JSON.stringify(c.arguments)})` : ""))
    .filter(Boolean)
    .join("\n");
}

/** One line of a pi transcript; user/thinking/other message types add no signal beyond the prompt already logged as the command, so they're skipped. */
function formatPiMessage(message: { role: string; content?: unknown[]; toolName?: string; isError?: boolean }): string {
  if (message.role === "assistant") return formatPiContent(message.content as never);
  if (message.role === "toolResult") {
    const text = formatPiContent(message.content as never);
    return `${message.isError ? "✗" : "✓"} ${message.toolName}${text ? `: ${text}` : ""}`;
  }
  return "";
}

/**
 * pi `--mode json` streams one JSON event per line (docs: @earendil-works/pi-coding-agent/docs/json.md); the
 * final `agent_end` event carries the full, authoritative message list, so the run-log transcript is built
 * from that rather than reassembling the streamed `message_update` deltas. Falls back to the raw captured
 * stream when pi never got there (crashed, killed, or produced something that isn't JSON).
 */
export function formatPiTranscript(raw: string): string {
  let agentEnd: { messages: { role: string }[] } | undefined;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "agent_end") agentEnd = event;
    } catch {
      // not JSON (stray CLI output) — ignore; the raw fallback below still has it
    }
  }
  if (!agentEnd) return raw;
  return `${agentEnd.messages.map(formatPiMessage).filter(Boolean).join("\n\n")}\n`;
}

/** A fixed (not `herdr.newToken()`) sentinel so the preview text stays stable across renders — see `describeRunInPane`'s own doc comment. */
const PREVIEW_TOKEN = "HERDR_DONE_PREVIEW";

/**
 * Human-readable preview of every command a real run of this task would send to herdr — tab
 * creation, the `pi` invocation itself (wrapped with the completion sentinel that reports its
 * exit code back), and the tab close — for display only (e.g. a Simulate feature), nothing is
 * run. Mirrors youtube-download.ts's `describeDownloadCommands`.
 */
export function describePiRun(task: Task, args: string[]): { cwd: string; commands: string[] } {
  const cwd = task.folderPath;
  const line = ["pi", ...args].map(herdr.shellQuote).join(" ");
  const commands: string[] = [
    herdr.describeCreateTab(cwd, herdrTabLabel(task.id)),
    "",
    ...herdr.describeRunInPane(envPrefix(task, "<run-id>") + piPipeline(line, "<json-file>", "<stderr-file>"), PREVIEW_TOKEN),
    "",
    herdr.describeCloseTab(),
  ];
  return { cwd, commands };
}

/**
 * Runs `pi` inside a herdr tab (visible/inspectable, like the YouTube downloader's yt-dlp jobs),
 * cwd'd to the task's own folder, and captures its `--mode json` event stream.
 *
 * The captured stream is parsed into the run log (`formatPiTranscript`) so a run's actual work is
 * visible there; the agent still files its own closing/hand-off result via
 * pi-tools/mailbox_send_result.ts — that's unrelated to output capture and stays the one way a run
 * ends (hops, hand-off addressing, results filing/labeling/email all key off that call).
 */
export async function runPiInHerdr(task: Task, args: string[], runId: string, mailHops?: number): Promise<void> {
  syncPiCustomModels();
  const promptPath = promptFilePath(task, runId);
  writeFileSync(promptPath, args[args.indexOf("-p") + 1]);
  const scratch = mkdtempSync(join(tmpdir(), "joey-pi-run-"));
  const [jsonFile, stderrFile] = [join(scratch, "stdout.jsonl"), join(scratch, "stderr")];
  const read = (file: string) => (existsSync(file) ? readFileSync(/* turbopackIgnore: true */ file, "utf8") : "");
  const command = piCommandViaPromptFile(task, args, runId, promptPath, jsonFile, stderrFile, mailHops);
  appendRunOutput(runId, `$ ${command}\n`);

  plog.info({ taskId: task.id, runId, model: task.model, cwd: task.folderPath }, "starting pi in herdr");
  try {
    const { exitCode, timedOut } = await herdr.runInTab(task.folderPath, herdrTabLabel(task.id), command);
    appendRunOutput(runId, formatPiTranscript(read(jsonFile)) + read(stderrFile));
    const fields = { taskId: task.id, runId, exitCode, timedOut };
    if (timedOut || exitCode !== 0) {
      plog.error(fields, "pi failed");
      throw new Error(timedOut ? "pi timed out" : `pi exited with code ${exitCode}`);
    }
    plog.info(fields, "pi exited 0");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(promptPath, { force: true });
  }
}
