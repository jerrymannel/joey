import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Task } from "./task-board.ts";
import { appendRunOutput } from "./run-log.ts";
import { readEmail, searchEmails } from "./gmail.ts";
import { fetchPlaylistVideos } from "./youtube.ts";
import { startDownload } from "./youtube-download.ts";

/**
 * A gmail/youtube automation's run: no model or prompt, it just writes its output into the automation's own
 * folder — matching emails as `<message id>.md` (gmail), or downloads of the playlist's videos as
 * `<video id>/` (youtube, started in the background exactly like the Downloads section's buttons). Anything
 * already in the folder is skipped, so a scheduled run only picks up what's new.
 */
export async function runAutomation(task: Task, runId: string): Promise<void> {
  const log = (line: string) => appendRunOutput(runId, `${line}\n`);

  if (task.service === "gmail") {
    if (!task.searchQuery) throw new Error("this automation has no Gmail search string");
    const found = await searchEmails(task.searchQuery);
    let saved = 0;
    for (const summary of found) {
      const file = join(task.folderPath, `${summary.id}.md`);
      if (existsSync(file)) continue;
      const mail = await readEmail(summary.id);
      const subject = mail.subject.replace(/\s+/g, " ");
      writeFileSync(file, `---\nid: ${mail.id}\nfrom: ${mail.from}\ndate: ${mail.date}\nsubject: ${subject}\n---\n${mail.body}\n`);
      saved++;
    }
    log(`Found ${found.length} matching email(s); saved ${saved} new one(s) to ${task.folderPath}`);
  } else if (task.service === "youtube") {
    if (!task.playlistId) throw new Error("this automation has no playlist");
    const videos = await fetchPlaylistVideos(task.playlistId);
    const fresh = videos.filter((v) => !existsSync(join(task.folderPath, v.videoId)));
    for (const v of fresh) startDownload(v.videoId, v.title, task.folderPath);
    log(`Playlist has ${videos.length} video(s); started ${fresh.length} new download(s) into ${task.folderPath} — progress is in the Downloads section`);
  } else {
    throw new Error(`"${task.service}" is not an automation`);
  }
}
