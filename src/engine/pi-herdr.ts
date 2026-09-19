import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as herdr from "./herdr.ts";
import { appendRunOutput } from "./run-log.ts";
import { listModels, piProviderName } from "./models.ts";
import type { Task } from "./task-board.ts";
import { resultsDir } from "./mailbox.ts";
import { errMsg, log } from "./logger.ts";

const plog = log("pi");

function herdrTabLabel(taskId: string): string {
  return `pi:${taskId}`;
}

/** Env vars set ahead of the command rather than passed to execFile, since the command is typed into an already-running herdr pane's shell, not spawned directly by us. */
function envPrefix(task: Task, runId: string, mailHops?: number): string {
  const parts: string[] = [];
  // pi-tools/index.ts (loaded via --extension, see harness.ts) calls into db.ts, which resolves
  // data/data.db relative to process.cwd() — but the herdr pane below is cwd'd to the task's own
  // folder, not this repo, so without this the tools would look for a database that isn't there.
  parts.push(`DATA_DB_PATH=${herdr.shellQuote(resolve(process.cwd(), "data/data.db"))}`);
  // pi-tools/send-message.ts and send-result.ts run in that same separate process: they need the results
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

/** The exact command line typed into the herdr pane, env prefix included — shared by the real run and `describePiRun`'s preview. pi's output stays in the tab; the agent reports back through the mailbox_send_result tool. */
function piCommand(task: Task, args: string[], runId: string, mailHops?: number): string {
  return envPrefix(task, runId, mailHops) + ["pi", ...args].map(herdr.shellQuote).join(" ");
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
  const commands: string[] = [
    herdr.describeCreateTab(cwd, herdrTabLabel(task.id)),
    "",
    ...herdr.describeRunInPane(piCommand(task, args, "<run-id>"), PREVIEW_TOKEN),
    "",
    herdr.describeCloseTab(),
  ];
  return { cwd, commands };
}

/**
 * Runs `pi` inside a herdr tab (visible/inspectable, like the YouTube downloader's yt-dlp jobs)
 * instead of a plain child_process, cwd'd to the task's own folder.
 *
 * pi's output isn't captured: the agent files its own result (pi-tools/send-result.ts) in the results
 * folder, tagged with this run, and the run log just records the command and how it ended.
 */
export async function runPiInHerdr(task: Task, args: string[], runId: string, mailHops?: number): Promise<void> {
  syncPiCustomModels();
  const command = piCommand(task, args, runId, mailHops);
  appendRunOutput(runId, `$ ${command}\n`);

  plog.info({ taskId: task.id, runId, model: task.model, cwd: task.folderPath }, "starting pi in herdr");
  const tab = await herdr.createTab(task.folderPath, herdrTabLabel(task.id));
  try {
    await herdr.runInPane(tab.paneId, command, herdr.newToken());
    plog.info({ taskId: task.id, runId }, "pi exited 0");
    appendRunOutput(runId, "pi finished successfully.\n");
  } catch (err) {
    plog.error({ taskId: task.id, runId, err: errMsg(err) }, "pi failed");
    appendRunOutput(runId, `pi failed: ${(err as Error).message}\n`);
    throw err;
  } finally {
    await herdr.closeTab(tab.tabId).catch((err) => plog.warn({ taskId: task.id, runId, err: errMsg(err) }, "couldn't close the herdr tab"));
  }
}
