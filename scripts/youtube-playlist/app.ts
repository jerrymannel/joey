import { existsSync } from "node:fs";
import { join } from "node:path";
import { output, param, taskDir } from "../joey.ts";
import { fetchPlaylistVideos } from "../../src/engine/youtube.ts";
import { enqueue, getDownloadJob, startDownload } from "../../src/engine/youtube-download.ts";

/**
 * Downloads (mp4, audio, subtitles; whisper transcript with `transcribe`) every video in `playlistId` not already in TASK_DIR, one at a time,
 * into `<TASK_DIR>/<video id>/`. The step output lists the new videos' folders.
 */
const playlistId = param("playlistId")!;
const transcribe = param("transcribe") !== "false";
const videos = await fetchPlaylistVideos(playlistId, param("account"));
const fresh = videos.filter((v) => !existsSync(join(taskDir, v.videoId)));
for (const v of fresh) startDownload(v.videoId, taskDir, transcribe);
console.log(`Playlist has ${videos.length} video(s); downloading ${fresh.length} new one(s) into ${taskDir}`);
await enqueue(async () => {}); // the queue is FIFO: this settles once every download above has
const failed = fresh.filter((v) => getDownloadJob(v.videoId)?.state === "failed");
for (const v of failed) console.error(`Failed: ${v.title} — ${getDownloadJob(v.videoId)?.error}`);
const done = fresh.filter((v) => !failed.includes(v));
output(`${done.length} new video(s) downloaded from playlist ${playlistId}:\n\n${done.map((v) => `- ${v.title} (${join(taskDir, v.videoId)})`).join("\n")}\n`);
if (failed.length > 0) process.exit(1);
