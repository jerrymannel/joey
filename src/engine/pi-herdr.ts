import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as herdr from "./herdr.ts";
import { appendRunOutput } from "./run-log.ts";
import { listModels, piProviderName } from "./models.ts";
import type { Task } from "./task-board.ts";

function herdrTabLabel(taskId: string): string {
  return `pi:${taskId}`;
}

/** Env vars set ahead of the command rather than passed to execFile, since the command is typed into an already-running herdr pane's shell, not spawned directly by us. */
function envPrefix(): string {
  const parts: string[] = [];
  // pi-tools/index.ts (loaded via --extension, see harness.ts) calls into db.ts, which resolves
  // data/data.db relative to process.cwd() — but the herdr pane below is cwd'd to the task's own
  // folder, not this repo, so without this the tools would look for a database that isn't there.
  parts.push(`DATA_DB_PATH=${herdr.shellQuote(resolve(process.cwd(), "data/data.db"))}`);
  return parts.length ? `${parts.join(" ")} ` : "";
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

/** Where a run's pi output is teed to so it can be read back into the run log once the pane's command finishes. */
function outputFile(runId: string): string {
  return join(tmpdir(), `joey-run-${runId}.log`);
}

/**
 * The exact command line typed into the herdr pane, env prefix included — shared by the real run and
 * `describePiRun`'s preview. pi's stdout/stderr are teed to `outFile` (still visible in the tab) since
 * herdr can't hand output back; the subshell + pipefail keeps the sentinel's exit code pi's, not tee's.
 */
function piCommand(args: string[], outFile: string): string {
  const pi = envPrefix() + ["pi", ...args].map(herdr.shellQuote).join(" ");
  return `( set -o pipefail; ${pi} 2>&1 | tee ${herdr.shellQuote(outFile)} )`;
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
    ...herdr.describeRunInPane(piCommand(args, outputFile("<run-id>")), PREVIEW_TOKEN),
    "",
    herdr.describeCloseTab(),
  ];
  return { cwd, commands };
}

/**
 * Runs `pi` inside a herdr tab (visible/inspectable, like the YouTube downloader's yt-dlp jobs)
 * instead of a plain child_process, cwd'd to the task's own folder.
 *
 * pi's output isn't streamed live into the run log (`herdr pane run` blocks on a completion sentinel):
 * it's teed to a file and appended to the log in one go when the command finishes, success or failure.
 */
export async function runPiInHerdr(task: Task, args: string[], runId: string): Promise<void> {
  syncPiCustomModels();
  const file = outputFile(runId);
  const command = piCommand(args, file);
  appendRunOutput(runId, `$ ${command}\n`);

  const tab = await herdr.createTab(task.folderPath, herdrTabLabel(task.id));
  try {
    await herdr.runInPane(tab.paneId, command, herdr.newToken());
    appendRunOutput(runId, "pi finished successfully.\n");
  } catch (err) {
    appendRunOutput(runId, `pi failed: ${(err as Error).message}\n`);
    throw err;
  } finally {
    try {
      appendRunOutput(runId, `\n--- pi output ---\n${readFileSync(file, "utf8")}`);
    } catch {
      // pi never started, so nothing was teed
    }
    rmSync(file, { force: true });
    await herdr.closeTab(tab.tabId).catch(() => {});
  }
}
