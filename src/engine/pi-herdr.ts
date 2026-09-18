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
  return parts.length ? `${parts.join(" ")} ` : "";
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
  const command = envPrefix(task) + ["pi", ...args].map(herdr.shellQuote).join(" ");
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
