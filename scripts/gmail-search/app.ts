import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { output, param, runDir } from "../joey.ts";
import { readEmail, searchEmails } from "../../src/engine/gmail.ts";

/** Saves every email matching `query` as `<RUN_DIR>/emails/<message id>.md`; the step output lists them. */
const query = param("query")!;
const account = param("account");
const max = Number(param("max") ?? 50);
const found = await searchEmails(query, account, max);
const dir = join(runDir, "emails");
mkdirSync(dir, { recursive: true });
const lines: string[] = [];
for (const summary of found) {
  const mail = await readEmail(summary.id, account);
  const subject = mail.subject.replace(/\s+/g, " ");
  const file = join(dir, `${mail.id}.md`);
  writeFileSync(file, `---\nid: ${mail.id}\nfrom: ${mail.from}\ndate: ${mail.date}\nsubject: ${subject}\n---\n${mail.body}\n`);
  lines.push(`- ${mail.date} — ${mail.from} — ${subject} (${file})`);
}
console.log(`${found.length} email(s) match "${query}", saved to ${dir}`);
output(`${found.length} email(s) matching \`${query}\`, one file each in ${dir}:\n\n${lines.join("\n")}\n`);
