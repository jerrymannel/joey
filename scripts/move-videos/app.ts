import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { output, param, taskDir } from "../joey.ts";

/**
 * Moves every `<TASK_DIR>/<video id>/video.mp4` (as youtube-playlist downloads it) to `<folder>/<video id>.mp4`. The video's folder stays, with
 * its audio, subtitles and transcript, so youtube-playlist still knows the video is done and won't download it again.
 */
const folder = param("folder")!;
mkdirSync(folder, { recursive: true });
const moved: string[] = [];
for (const id of readdirSync(taskDir)) {
  const from = join(taskDir, id, "video.mp4");
  if (!existsSync(from)) continue;
  const to = join(folder, `${id}.mp4`);
  try {
    renameSync(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    copyFileSync(from, to); // another disk: rename can't cross it
    unlinkSync(from);
  }
  console.log(`Moved ${from} → ${to}`);
  moved.push(to);
}
output(`${moved.length} video(s) moved to ${folder}:\n\n${moved.map((m) => `- ${m}`).join("\n")}\n`);
