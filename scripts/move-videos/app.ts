import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { output, param, taskDir } from "../joey.ts";

/**
 * Moves every `<TASK_DIR>/<video id>/video.mp4` (as youtube-playlist downloads it) to `<folder>/<title> [<video id>].mp4` for Plex, with its poster
 * (`.jpg`) and English subtitles (`.en.srt`) copied beside it under the same name. The video's folder stays, with its audio, subtitles and
 * transcript, so youtube-playlist still knows the video is done and won't download it again.
 */
const folder = param("folder")!;
mkdirSync(folder, { recursive: true });
const moved: string[] = [];
for (const id of readdirSync(taskDir)) {
  const dir = join(taskDir, id);
  if (!existsSync(join(dir, "video.mp4"))) continue;
  const info = join(dir, "info.info.json");
  const title = existsSync(info) ? (JSON.parse(readFileSync(info, "utf8")).title as string) : "";
  // Characters no filesystem (or Plex) likes, and a cap so `<title> [<id>].en.srt` stays under 255 bytes.
  const clean = title.replace(/[/\\:*?"<>|\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  const name = join(folder, clean ? `${clean} [${id}]` : id);
  const subs = readdirSync(dir).filter((f) => /^subtitles\.en.*\.srt$/.test(f)).sort((a, b) => a.length - b.length)[0]; // subtitles.en.srt first
  if (existsSync(join(dir, "poster.jpg"))) copyFileSync(join(dir, "poster.jpg"), `${name}.jpg`);
  if (subs) copyFileSync(join(dir, subs), `${name}.en.srt`);
  try {
    renameSync(join(dir, "video.mp4"), `${name}.mp4`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    copyFileSync(join(dir, "video.mp4"), `${name}.mp4`); // another disk: rename can't cross it
    unlinkSync(join(dir, "video.mp4"));
  }
  console.log(`Moved ${join(dir, "video.mp4")} → ${name}.mp4`);
  moved.push(`${name}.mp4`);
}
output(`${moved.length} video(s) moved to ${folder}:\n\n${moved.map((m) => `- ${m}`).join("\n")}\n`);
