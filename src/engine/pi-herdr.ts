import { resolve } from "node:path";
import * as herdr from "./herdr.ts";
import { appendRunOutput } from "./run-log.ts";
import { getModelByValue } from "./models.ts";
import type { Task } from "./task-board.ts";

function herdrTabLabel(taskId: string): string {
  return `pi:${taskId}`;
}

/** Env vars set ahead of the command rather than passed to execFile, since the command is typed into an already-running herdr pane's shell, not spawned directly by us. */
function envPrefix(task: Task): string {
  const parts: string[] = [];
  if (task.model) parts.push(`MODEL=${herdr.shellQuote(task.model)}`);
  const endpoint = task.model ? getModelByValue(task.model)?.endpoint : undefined;
  // ANTHROPIC_BASE_URL is the real, documented Anthropic SDK/CLI env var for a custom endpoint — pi's own
  // support for it (or a different var name) hasn't been confirmed against the real binary yet.
  if (endpoint) parts.push(`ANTHROPIC_BASE_URL=${herdr.shellQuote(endpoint)}`);
  // pi-tools/index.ts (loaded via --extension, see harness.ts) calls into db.ts, which resolves
  // data/data.db relative to process.cwd() — but the herdr pane below is cwd'd to the task's own
  // folder, not this repo, so without this the tools would look for a database that isn't there.
  parts.push(`DATA_DB_PATH=${herdr.shellQuote(resolve(process.cwd(), "data/data.db"))}`);
  return parts.length ? `${parts.join(" ")} ` : "";
}

/** The exact `pi ...` command line typed into the herdr pane, env prefix included — shared by the real run and `describePiRun`'s preview. */
function piCommand(task: Task, args: string[]): string {
  return envPrefix(task) + ["pi", ...args].map(herdr.shellQuote).join(" ");
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
    ...herdr.describeRunInPane(piCommand(task, args), PREVIEW_TOKEN),
    "",
    herdr.describeCloseTab(),
  ];
  return { cwd, commands };
}

/**
 * Runs `pi` inside a herdr tab (visible/inspectable, like the YouTube downloader's yt-dlp jobs)
 * instead of a plain child_process, cwd'd to the task's own folder.
 *
 * ponytail: unlike the spawn-based path used for the other harnesses, this doesn't stream pi's
 * live stdout into the run log — `herdr pane run` blocks on a completion sentinel rather than
 * streaming, the same tradeoff youtube-download.ts already accepts for yt-dlp. Only lifecycle
 * events are appended here. Upgrade path: capture the pane's scrollback into `appendRunOutput`
 * once/if herdr exposes a "read pane output" command.
 */
export async function runPiInHerdr(task: Task, args: string[], runId: string): Promise<void> {
  const command = piCommand(task, args);
  appendRunOutput(runId, `$ ${command}\n`);

  const tab = await herdr.createTab(task.folderPath, herdrTabLabel(task.id));
  try {
    await herdr.runInPane(tab.paneId, command, herdr.newToken());
    appendRunOutput(runId, "pi finished successfully.\n");
  } catch (err) {
    appendRunOutput(runId, `pi failed: ${(err as Error).message}\n`);
    throw err;
  } finally {
    await herdr.closeTab(tab.tabId).catch(() => {});
  }
}
