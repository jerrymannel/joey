import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { output, param, runDir } from "../joey.ts";
import { listMessageIds, readEmail } from "../../src/engine/gmail.ts";

/**
 * Saves each unprocessed email matching `query` as `<RUN_DIR>/emails/<message id>.md`. Messages are pulled a page (10) at a time and
 * processed until `max` new ones are handled; every processed id is recorded in gmail.db so later runs never touch the same mail again.
 */
const BATCH = 10;
const query = param("query")!;
const account = param("account");
const max = Number(param("max") ?? 50);

// gmail.db sits beside the engine's databases (DATA_DB_PATH), so the processed set is shared across every run.
const db = new Database(join(dirname(process.env.DATA_DB_PATH!), "gmail.db"));
db.pragma("journal_mode = WAL");
db.exec("CREATE TABLE IF NOT EXISTS processed_emails (id TEXT PRIMARY KEY, account TEXT, processed_at TEXT NOT NULL)");
const seen = db.prepare("SELECT 1 FROM processed_emails WHERE id = ?");
const mark = db.prepare("INSERT OR IGNORE INTO processed_emails (id, account, processed_at) VALUES (?, ?, ?)");

const dir = join(runDir, "emails");
mkdirSync(dir, { recursive: true });
const lines: string[] = [];
let pageToken: string | undefined;
while (lines.length < max) {
  const { ids, nextPageToken } = await listMessageIds(query, account, BATCH, pageToken);
  for (const id of ids) {
    if (lines.length >= max) break;
    if (seen.get(id)) continue;
    const mail = await readEmail(id, account);
    const subject = mail.subject.replace(/\s+/g, " ");
    const file = join(dir, `${mail.id}.md`);
    writeFileSync(file, `---\nid: ${mail.id}\nfrom: ${mail.from}\ndate: ${mail.date}\nsubject: ${subject}\n---\n${mail.body}\n`);
    mark.run(mail.id, account ?? "", new Date().toISOString());
    lines.push(`- ${mail.date} — ${mail.from} — ${subject} (${file})`);
  }
  if (!nextPageToken) break;
  pageToken = nextPageToken;
}
console.log(`${lines.length} new email(s) for "${query}", saved to ${dir}`);
output(`${lines.length} new email(s) matching \`${query}\`, one file each in ${dir}:\n\n${lines.join("\n")}\n`);
