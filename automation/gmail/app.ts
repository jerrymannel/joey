import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Task } from "../../src/engine/task-board.ts";
import { readEmail, searchEmails } from "../../src/engine/gmail.ts";

/**
 * A gmail automation's run: saves every search match not already saved as `<message id>.md` in the
 * task's folder. Existing files are skipped, so a scheduled run only picks up what's new.
 */
export async function run(task: Task, note: (line: string) => void): Promise<void> {
  if (!task.searchQuery) throw new Error("this automation has no Gmail search string");
  const account = task.account || undefined; // empty = the first connected account
  const found = await searchEmails(task.searchQuery, account);
  let saved = 0;
  for (const summary of found) {
    const file = join(task.folderPath, `${summary.id}.md`);
    if (existsSync(file)) continue;
    const mail = await readEmail(summary.id, account);
    const subject = mail.subject.replace(/\s+/g, " ");
    writeFileSync(file, `---\nid: ${mail.id}\nfrom: ${mail.from}\ndate: ${mail.date}\nsubject: ${subject}\n---\n${mail.body}\n`);
    saved++;
  }
  note(`Found ${found.length} matching email(s); saved ${saved} new one(s) to ${task.folderPath}`);
}
