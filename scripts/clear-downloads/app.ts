import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { output, runDir, taskDir } from "../joey.ts";
import { youtubeDb } from "../youtube-db.ts";
import { TRANSCRIBED_SUFFIX } from "../../src/engine/transcription-run.ts";

/**
 * Deletes what the download scripts fetched, never what was generated from it:
 * - `<RUN_DIR>/emails/` — the mail gmail-search saved (gmail.db, not these files, keeps it from being fetched again).
 * - In `<TASK_DIR>/<video id>/` of every video youtube.db says this task has processed: the files youtube-download.ts names video.*, audio.*,
 *   subtitles.*, poster.*, info.*. The whisper transcript and anything an agent wrote there stay; unprocessed videos are left whole for a later run.
 */
const DOWNLOADED = /^(video|audio|subtitles|poster|info)\./;
const size = (p: string): number => (statSync(p).isDirectory() ? readdirSync(p).reduce((n, f) => n + size(join(p, f)), 0) : statSync(p).size);
let bytes = 0;
const cleared: string[] = [];

const emails = join(runDir, "emails");
if (existsSync(emails)) {
  const n = readdirSync(emails).length;
  bytes += size(emails);
  rmSync(emails, { recursive: true });
  cleared.push(`- ${n} email(s): ${emails}`);
}

const processed = youtubeDb().prepare("SELECT id FROM videos WHERE task = ? AND processed_at IS NOT NULL").pluck().all(process.env.TASK_ID!) as string[];
for (const id of processed) {
  const dir = join(taskDir, id);
  if (!existsSync(dir)) continue;
  const doomed = readdirSync(dir).filter((f) => DOWNLOADED.test(f) && !f.endsWith(TRANSCRIBED_SUFFIX));
  for (const f of doomed) {
    bytes += size(join(dir, f));
    rmSync(join(dir, f));
  }
  if (doomed.length) cleared.push(`- video ${id}: ${doomed.join(", ")}`);
}

const mb = (bytes / 1e6).toFixed(1);
console.log(`Cleared ${cleared.length} download(s), ${mb} MB`);
output(`Cleared ${mb} MB of downloads${cleared.length ? `:\n\n${cleared.join("\n")}` : " (nothing to clear)."}\n`);
