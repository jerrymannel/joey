import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { output, param, taskDir } from "../joey.ts";
import { runSshCommand } from "../../src/engine/ssh.ts";
import { shellQuote } from "../../src/engine/herdr.ts";

/**
 * Moves every `<TASK_DIR>/<video id>/video.mp4` (as youtube-playlist downloads it) to `<folder>/<title> [<video id>].mp4` for Plex / Jellyfin, with its poster
 * (`.jpg`) and English subtitles (`.en.srt`) copied beside it under the same name. With `server` (an SSH configuration from Settings → SSH), `folder` is on that
 * server and the files are uploaded over ssh — each as `.part`, renamed once complete so the media server never scans half a file — and the local mp4 is
 * deleted only after its upload succeeded. The video's folder stays, with its audio, subtitles and transcript, so youtube-playlist still knows the video is
 * done and won't download it again.
 */
const folder = param("folder")!;
const server = param("server");
if (!server) mkdirSync(folder, { recursive: true });

async function upload(from: string, to: string): Promise<void> {
  const part = shellQuote(`${to}.part`);
  const cmd = `mkdir -p ${shellQuote(folder)} && cat > ${part} && mv ${part} ${shellQuote(to)}`;
  const r = await runSshCommand(server!, cmd, 3600, from);
  if (r.exitCode !== 0) throw new Error(`upload of ${from} to ${server}:${to} failed${r.timedOut ? " (timed out)" : ""}: ${r.stderr.trim()}`);
}

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
  const sidecars: [string, string][] = [];
  if (existsSync(join(dir, "poster.jpg"))) sidecars.push([join(dir, "poster.jpg"), `${name}.jpg`]);
  if (subs) sidecars.push([join(dir, subs), `${name}.en.srt`]);
  if (server) {
    for (const [from, to] of sidecars) await upload(from, to);
    await upload(join(dir, "video.mp4"), `${name}.mp4`);
    unlinkSync(join(dir, "video.mp4"));
  } else {
    for (const [from, to] of sidecars) copyFileSync(from, to);
    try {
      renameSync(join(dir, "video.mp4"), `${name}.mp4`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
      copyFileSync(join(dir, "video.mp4"), `${name}.mp4`); // another disk: rename can't cross it
      unlinkSync(join(dir, "video.mp4"));
    }
  }
  const dest = server ? `${server}:${name}.mp4` : `${name}.mp4`;
  console.log(`Moved ${join(dir, "video.mp4")} → ${dest}`);
  moved.push(dest);
}
output(`${moved.length} video(s) moved to ${server ? `${server}:` : ""}${folder}:\n\n${moved.map((m) => `- ${m}`).join("\n")}\n`);
