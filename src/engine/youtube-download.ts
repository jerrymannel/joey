import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export type DownloadState = "queued" | "video" | "audio" | "subtitles" | "done" | "failed";

export interface DownloadJob {
  state: DownloadState;
  log: string;
  error?: string;
}

/** Process-local job table: fine for a single-user local app (mirrors _oauth-state.ts). */
const jobs = new Map<string, DownloadJob>();

export function getDownloadJob(videoId: string): DownloadJob | undefined {
  return jobs.get(videoId);
}

const ACTIVE_STATES = new Set<DownloadState>(["queued", "video", "audio", "subtitles"]);

/** yt-dlp run once per artifact rather than one combined invocation — simplest way to get three separate files without parsing its output for post-processed filenames. */
const STEPS: { state: DownloadState; args: string[] }[] = [
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

/** Kicks off (or no-ops if already in flight) a background download of a video's mp4, audio, and subtitles into `<workspaceFolder>/<videoId>/`. */
export function startDownload(videoId: string, workspaceFolder: string): void {
  const existing = jobs.get(videoId);
  if (existing && ACTIVE_STATES.has(existing.state)) return;
  jobs.set(videoId, { state: "queued", log: "" });
  void run(videoId, workspaceFolder);
}

async function run(videoId: string, workspaceFolder: string): Promise<void> {
  const job = jobs.get(videoId)!;
  const dir = join(workspaceFolder, videoId);
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    mkdirSync(dir, { recursive: true });
    for (const step of STEPS) {
      job.state = step.state;
      await runYtDlp(videoId, dir, [...step.args, url]);
    }
    job.state = "done";
  } catch (err) {
    job.state = "failed";
    job.error = (err as Error).message;
  }
}

function runYtDlp(videoId: string, cwd: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("yt-dlp", args, { cwd });
    const job = jobs.get(videoId)!;
    child.stdout.on("data", (chunk: Buffer) => (job.log += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (job.log += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`yt-dlp exited with code ${code}`));
    });
  });
}
