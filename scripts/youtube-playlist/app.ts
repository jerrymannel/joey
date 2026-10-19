import { existsSync } from "node:fs";
import { join } from "node:path";
import { output, param, taskDir } from "../joey.ts";
import { youtubeDb } from "../youtube-db.ts";
import { fetchPlaylistVideos } from "../../src/engine/youtube.ts";
import { enqueue, getDownloadJob, startDownload } from "../../src/engine/youtube-download.ts";
import { TRANSCRIBED_SUFFIX } from "../../src/engine/transcription-run.ts";

/**
 * Downloads (mp4, audio, subtitles; whisper transcript with `transcribe`) every video in `playlistId` not yet downloaded or processed, one at a time,
 * into `<TASK_DIR>/<video id>/`. A video counts as downloaded once its last file is there (the transcript, or audio.mp3 without `transcribe`), so a
 * failed download is retried next run. The step output lists every downloaded video not yet processed (youtube.db, see youtube-db.ts), so a video
 * whose run failed later on is listed again next time; a processed one is skipped for good. Fails only when nothing is left to list.
 */
const playlistId = param("playlistId")!;
const transcribe = param("transcribe") !== "false";
const db = youtubeDb();
const task = process.env.TASK_ID!;
const processed = new Set(db.prepare("SELECT id FROM videos WHERE task = ? AND processed_at IS NOT NULL").pluck().all(task) as string[]);
const videos = (await fetchPlaylistVideos(playlistId, param("account"))).filter((v) => !processed.has(v.videoId));
const lastFile = transcribe ? `audio.mp3${TRANSCRIBED_SUFFIX}` : "audio.mp3";
const fresh = videos.filter((v) => !existsSync(join(taskDir, v.videoId, lastFile)));
for (const v of fresh) startDownload(v.videoId, taskDir, transcribe);
console.log(`Playlist has ${videos.length} unprocessed video(s); downloading ${fresh.length} new one(s) into ${taskDir}`);
await enqueue(async () => {}); // the queue is FIFO: this settles once every download above has
const failed = fresh.filter((v) => getDownloadJob(v.videoId)?.state === "failed");
for (const v of failed) console.error(`Failed: ${v.title} — ${getDownloadJob(v.videoId)?.error}`);
const pending = videos.filter((v) => existsSync(join(taskDir, v.videoId, lastFile)));
const list = db.prepare("INSERT INTO videos (task, id, title, listed_at) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET title = excluded.title");
for (const v of pending) list.run(task, v.videoId, v.title, new Date().toISOString());
output(`${pending.length} video(s) to process from playlist ${playlistId}:\n\n${pending.map((v) => `- ${v.title} (${join(taskDir, v.videoId)})`).join("\n")}\n`);
if (failed.length > 0 && pending.length === 0) process.exit(1);
