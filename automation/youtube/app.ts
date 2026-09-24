import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Task } from "../../src/engine/task-board.ts";
import { fetchPlaylistVideos } from "../../src/engine/youtube.ts";
import { enqueue, startDownload } from "../../src/engine/youtube-download.ts";

/** Writes `files.txt` in the folder: the absolute path of every file under it (the list itself excluded), one per line, sorted — meant as agent input. */
function writeFileList(folder: string): void {
  const files = readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((rel) => rel !== "files.txt" && statSync(join(folder, rel)).isFile())
    .map((rel) => join(folder, rel))
    .sort();
  writeFileSync(join(folder, "files.txt"), files.map((f) => `${f}\n`).join(""));
}

/**
 * A youtube automation's run: starts a download (mp4/audio/subtitles, optionally transcribed) for every
 * playlist video not already downloaded into the task's folder — same as the Downloads section's buttons —
 * then lists the folder's files once those downloads finish.
 */
export async function run(task: Task, note: (line: string) => void): Promise<void> {
  if (!task.playlistId) throw new Error("this automation has no playlist");
  const account = task.account || undefined;
  const videos = await fetchPlaylistVideos(task.playlistId, account);
  const fresh = videos.filter((v) => !existsSync(join(task.folderPath, v.videoId)));
  for (const v of fresh) startDownload(v.videoId, v.title, task.folderPath, task.transcribe);
  // Queued behind the downloads just started (the queue is FIFO), so it lists their files once they're done.
  void enqueue(async () => writeFileList(task.folderPath));
  note(`Playlist has ${videos.length} video(s); started ${fresh.length} new download(s) into ${task.folderPath} — progress is in the Downloads section`);
}
