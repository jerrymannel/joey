import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as herdr from "./herdr.ts";
import { transcribeAudio } from "./whisper.ts";
import { TRANSCRIBED_SUFFIX } from "./transcription-run.ts";
import { errMsg, log } from "./logger.ts";

const ylog = log("youtube-download");

export type DownloadState = "queued" | "metadata" | "video" | "audio" | "subtitles" | "transcribing" | "done" | "failed";

export interface DownloadJob {
  state: DownloadState;
  error?: string;
}

/** Process-local job table: fine for a single-user local app (mirrors _oauth-state.ts). */
const jobs = new Map<string, DownloadJob>();

export function getDownloadJob(videoId: string): DownloadJob | undefined {
  return jobs.get(videoId);
}

const ACTIVE_STATES = new Set<DownloadState>(["queued", "metadata", "video", "audio", "subtitles", "transcribing"]);

/** yt-dlp run once per artifact rather than one combined invocation — simplest way to get separate files without parsing its output for post-processed filenames. An `optional` step's failure is warned and skipped, not fatal. */
const STEPS: { state: DownloadState; args: string[]; optional?: boolean }[] = [
  { state: "metadata", args: ["--write-info-json", "--skip-download", "-o", "info.%(ext)s"] },
  { state: "video", args: ["-f", "bv*+ba/b", "--merge-output-format", "mp4", "-o", "video.%(ext)s"] },
  { state: "audio", args: ["-x", "--audio-format", "mp3", "-o", "audio.%(ext)s"] },
  {
    // Subtitles are a nice-to-have: many videos have none in the requested languages, and yt-dlp exits non-zero then — that must not fail the download.
    state: "subtitles",
    optional: true,
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

function ytDlpCommand(step: (typeof STEPS)[number], url: string): string {
  return ["yt-dlp", ...step.args, url].map(herdr.shellQuote).join(" ");
}

function herdrTabLabel(videoId: string): string {
  return `yt-dlp:${videoId}`;
}

let queue: Promise<void> = Promise.resolve();
/** Runs jobs strictly one after another — across every video, not just within one — so a playlist's worth of downloads never sends YouTube parallel requests. A failing job doesn't stop the ones behind it. */
export function enqueue(job: () => Promise<void>): Promise<void> {
  return (queue = queue.then(job).catch((err) => ylog.error({ err: errMsg(err) }, "download job crashed")));
}

/** Queues (or no-ops if already queued/in flight) a background download of a video's mp4, audio, and subtitles — and with `transcribe`, a whisper transcript of the audio as `audio.mp3.transcribed.txt` — into `<workspaceFolder>/<videoId>/` once the downloads ahead of it are done, running the job in its own herdr tab (created at the start, closed once the job finishes) so it's visible and inspectable. Its progress is `getDownloadJob(videoId)`. */
export function startDownload(videoId: string, workspaceFolder: string, transcribe = false): void {
  const existing = jobs.get(videoId);
  if (existing && ACTIVE_STATES.has(existing.state)) return;
  jobs.set(videoId, { state: "queued" });
  void enqueue(() => runJob(videoId, join(workspaceFolder, videoId), transcribe));
}

/** Queues a download into `<folder>/<videoId>/` and waits for it (and anything ahead of it in the queue) to finish; throws if it failed. For the youtube_download_video tool. */
export async function downloadVideoAndWait(videoId: string, folder: string, transcribe = false): Promise<DownloadJob> {
  const existing = jobs.get(videoId);
  if (existing && ACTIVE_STATES.has(existing.state)) throw new Error(`a download of ${videoId} is already in progress`);
  jobs.set(videoId, { state: "queued" });
  await enqueue(() => runJob(videoId, join(folder, videoId), transcribe));
  const job = jobs.get(videoId)!;
  if (job.state === "failed") throw new Error(job.error ?? `downloading ${videoId} failed`);
  return job;
}

async function runJob(videoId: string, dir: string, transcribe: boolean): Promise<void> {
  const job = jobs.get(videoId)!;
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let tabId: string | undefined;
  let downloaded = false;
  try {
    mkdirSync(dir, { recursive: true });
    const tab = await herdr.createTab(dir, herdrTabLabel(videoId));
    tabId = tab.tabId;
    for (const step of STEPS) {
      job.state = step.state;
      const command = ytDlpCommand(step, url);
      if (step.optional) {
        const code = await herdr.runInPaneExit(tab.paneId, command, herdr.newToken());
        if (code !== 0) ylog.warn({ videoId, state: step.state, code }, "optional yt-dlp step failed — continuing without it");
      } else {
        await herdr.runInPane(tab.paneId, command, herdr.newToken());
      }
    }
    downloaded = true;
  } catch (err) {
    fail(videoId, job, err);
  } finally {
    // A tab that won't close is logged, never allowed to mask why the job itself failed.
    if (tabId) await herdr.closeTab(tabId).catch((err) => ylog.warn({ videoId, err: errMsg(err) }, "failed to close the download's herdr tab"));
  }
  if (!downloaded) return;

  // After the download's own tab is closed — whisper runs in a tab of its own.
  try {
    if (transcribe) {
      job.state = "transcribing";
      await transcribeAudio(join(dir, "audio.mp3"), { outputPath: join(dir, `audio.mp3${TRANSCRIBED_SUFFIX}`) });
    }
    job.state = "done";
  } catch (err) {
    fail(videoId, job, err);
  }
}

function fail(videoId: string, job: DownloadJob, err: unknown): void {
  job.state = "failed";
  job.error = errMsg(err);
  ylog.error({ videoId, err: job.error }, "download failed");
}
