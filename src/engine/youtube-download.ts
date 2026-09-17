import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as herdr from "./herdr.ts";
import { createYoutubeRun, getYoutubeRun, updateYoutubeRunStatus } from "./youtube-run-log.ts";

export type DownloadState = "queued" | "metadata" | "video" | "audio" | "subtitles" | "done" | "failed";

export interface DownloadJob {
  state: DownloadState;
  error?: string;
}

/** Process-local job table: fine for a single-user local app (mirrors _oauth-state.ts). */
const jobs = new Map<string, DownloadJob>();

export function getDownloadJob(videoId: string): DownloadJob | undefined {
  return jobs.get(videoId);
}

const ACTIVE_STATES = new Set<DownloadState>(["queued", "metadata", "video", "audio", "subtitles"]);

/** yt-dlp run once per artifact rather than one combined invocation — simplest way to get separate files without parsing its output for post-processed filenames. */
const STEPS: { state: DownloadState; args: string[] }[] = [
  { state: "metadata", args: ["--write-info-json", "--skip-download", "-o", "info.%(ext)s"] },
  { state: "video", args: ["-f", "bv*+ba/b", "--merge-output-format", "mp4", "-o", "video.%(ext)s"] },
  { state: "audio", args: ["-x", "--audio-format", "mp3", "-o", "audio.%(ext)s"] },
  {
    state: "subtitles",
    args: [
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "en.*,en",
      "--convert-subs",
      "srt",
      "-o",
      "subtitles.%(ext)s",
    ],
  },
];

/** Single-quotes a value for safe use in a real shell — this command line is typed into the herdr pane's live bash, not passed through execFile's argv, so every arg needs real shell quoting (e.g. yt-dlp's `-o info.%(ext)s` has a bare `(` that bash would otherwise choke on). */
function quote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** The token each step's command echoes once it finishes, so `herdr pane wait-output` can tell real completion apart from the command merely being echoed back or from an earlier step's output still in the pane's scrollback. */
function doneToken(videoId: string, state: DownloadState): string {
  return `HERDR_DONE_${videoId}_${state}`;
}

function ytDlpCommand(step: (typeof STEPS)[number], url: string): string {
  return ["yt-dlp", ...step.args, url].map(quote).join(" ");
}

function herdrTabLabel(videoId: string): string {
  return `yt-dlp:${videoId}`;
}

/** Human-readable commands a download of this video would run — the folder setup, the herdr tab it runs in, each yt-dlp step, and closing that tab — and the folder (under the configured workspace) they'd run in. An empty string marks the gap between groups. For display only, nothing is run. */
export function describeDownloadCommands(videoId: string, workspaceFolder: string): { cwd: string; commands: string[] } {
  const cwd = join(workspaceFolder, videoId);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const commands: string[] = [`mkdir -p ${quote(cwd)}`, "", herdr.describeCreateTab(cwd, herdrTabLabel(videoId))];

  for (const step of STEPS) {
    commands.push("", ...herdr.describeRunInPane(ytDlpCommand(step, url), doneToken(videoId, step.state)));
  }

  commands.push("", herdr.describeCloseTab());
  return { cwd, commands };
}

/** Kicks off (or no-ops if already in flight) a background download of a video's mp4, audio, and subtitles into `<workspaceFolder>/<videoId>/`, running the job in its own herdr tab (created at the start, closed once the job finishes) so it's visible and inspectable. Logs a run row so past downloads (and their artifact folder) stay visible after the in-memory job table is gone. */
export function startDownload(videoId: string, title: string, workspaceFolder: string): void {
  const existing = jobs.get(videoId);
  if (existing && ACTIVE_STATES.has(existing.state)) return;
  jobs.set(videoId, { state: "queued" });
  const dir = join(workspaceFolder, videoId);
  const run = createYoutubeRun(videoId, title, dir);
  void runJob(run.id, videoId, dir);
}

async function runJob(runId: string, videoId: string, dir: string): Promise<void> {
  const job = jobs.get(videoId)!;
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let tabId: string | undefined;
  try {
    mkdirSync(dir, { recursive: true });
    const tab = await herdr.createTab(dir, herdrTabLabel(videoId));
    tabId = tab.tabId;
    for (const step of STEPS) {
      job.state = step.state;
      updateYoutubeRunStatus(runId, step.state);
      await herdr.runInPane(tab.paneId, ytDlpCommand(step, url), herdr.newToken());
    }
    job.state = "done";
    updateYoutubeRunStatus(runId, "done");
  } catch (err) {
    job.state = "failed";
    job.error = (err as Error).message;
    updateYoutubeRunStatus(runId, "failed", { errorMessage: job.error });
  } finally {
    if (tabId) await reportTabClose(runId, job, tabId);
  }
}

/** Closes the job's herdr tab and records the outcome on the run — appended to an existing failure rather than overwriting it, so a close failure is never lost but also never masks why the job itself failed. */
async function reportTabClose(runId: string, job: DownloadJob, tabId: string): Promise<void> {
  try {
    await herdr.closeTab(tabId);
  } catch (err) {
    const closeError = `failed to close herdr tab: ${(err as Error).message}`;
    const existing = getYoutubeRun(runId)?.errorMessage;
    updateYoutubeRunStatus(runId, job.state, { errorMessage: existing ? `${existing}; ${closeError}` : closeError });
  }
}
