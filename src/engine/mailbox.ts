import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getMailboxFolder } from "./settings.ts";

/**
 * File-based agent mailbox: `<mailbox folder>/MAILBOX/{INBOX,DONE,RESULTS}/<ISO timestamp>-<id>.md`, each file
 * flat `key: value` front matter (to, from, thread, hops, subject, run) + a markdown body. RESULTS holds each
 * run's final output (`to: me`, `from:` the task id, `run:` the run id — see sendResult); it is never scanned
 * for delivery. A human can drop one in by hand; agents send via pi-tools/send-message.ts. Every function takes the MAILBOX dir
 * (`mailboxDir()`, or `MESSAGES_DIR` inside a pi process) so this module needs no DB access to test.
 */

/** A reply carries hops + 1; anything above this is refused (send) or dumped in DONE untriggered (scan). */
export const MAX_HOPS = 5;

export interface Message {
  /** Filename, e.g. `2026-09-18T10-00-00-123Z-a1b2c3.md` — sorts chronologically. */
  file: string;
  id: string;
  to: string;
  from: string;
  thread: string;
  hops: number;
  subject: string;
  /** The run this message reports on (results only); empty otherwise. */
  run: string;
  body: string;
  status: "inbox" | "done" | "result";
}

/** `<mailbox folder setting>/MAILBOX` (the setting defaults to the process cwd). */
export function mailboxDir(): string {
  return join(getMailboxFolder(), "MAILBOX");
}

// The mailbox is a user-set local folder, not a project asset: the turbopackIgnore comments on `dir` below stop
// Turbopack tracing the whole repo for the dynamic path (same as db.ts).
const FOLDERS = ["INBOX", "DONE", "RESULTS"] as const;

/** `2026-09-18T10-00-00[-123]Z-id.md` → ISO string; null for hand-named files that don't follow the pattern. */
export function sentAt(file: string): string | null {
  const m = /^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)(?:-(\d{3}))?Z-/.exec(file);
  return m ? `${m[1]}:${m[2]}:${m[3]}.${m[4] ?? "000"}Z` : null;
}

/** Creates the mailbox and its folders (a no-op for ones that exist) — also called when the setting changes, so the new location is ready. */
export function ensureMailbox(dir: string): void {
  for (const folder of FOLDERS) mkdirSync(join(/* turbopackIgnore: true */ dir, folder), { recursive: true });
}
const ensure = ensureMailbox;

/** Returns null when the text isn't a well-formed message (no front matter, no `to`/`from`, bad `hops`). */
export function parseMessage(file: string, text: string, status: Message["status"]): Message | null {
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) return null;
  const fields: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const id = file.replace(/\.md$/, "").replace(/^\d{4}-\d\d-\d\dT[\d-]+Z-/, "");
  const hops = fields.hops === undefined ? 0 : Number(fields.hops);
  if (!fields.to || !fields.from || !Number.isInteger(hops) || hops < 0) return null;
  return {
    file,
    id,
    to: fields.to,
    from: fields.from,
    thread: fields.thread || id,
    hops,
    subject: fields.subject ?? "",
    run: fields.run ?? "",
    body: (m[2] ?? "").trim(),
    status,
  };
}

function serialize(m: Pick<Message, "to" | "from" | "thread" | "hops" | "subject" | "run" | "body">): string {
  const subject = m.subject.replace(/\s+/g, " ").trim(); // front matter is one line per key
  const run = m.run ? `run: ${m.run}\n` : "";
  return `---\nto: ${m.to}\nfrom: ${m.from}\nthread: ${m.thread}\nhops: ${m.hops}\nsubject: ${subject}\n${run}---\n${m.body}\n`;
}

function mdFiles(dir: string, folder: (typeof FOLDERS)[number]): string[] {
  return readdirSync(join(/* turbopackIgnore: true */ dir, folder))
    .filter((f) => f.endsWith(".md") && !f.startsWith("."))
    .sort();
}

/** Every readable message in INBOX (status "inbox") and DONE ("done"); dotfiles and malformed files are ignored. Oldest first per folder. */
export function listMessages(dir: string): Message[] {
  ensure(dir);
  const out: Message[] = [];
  for (const [folder, status] of [["INBOX", "inbox"], ["DONE", "done"]] as const) {
    for (const file of mdFiles(dir, folder)) {
      const msg = parseMessage(file, readFileSync(join(/* turbopackIgnore: true */ dir, folder, file), "utf8"), status);
      if (msg) out.push(msg);
    }
  }
  return out;
}

/** Atomically writes a new message file (`.<name>.tmp` then rename, so a scanner never sees a partial one) and returns its name. */
function write(dir: string, folder: (typeof FOLDERS)[number], m: Parameters<typeof serialize>[0]): string {
  const id = randomBytes(3).toString("hex");
  // ms resolution (the spec'd name has seconds only) so two sends in one second still sort in send order.
  const file = `${new Date().toISOString().replace(/[:.]/g, "-")}-${id}.md`;
  ensure(dir);
  const tmp = join(/* turbopackIgnore: true */ dir, folder, `.${file}.tmp`);
  writeFileSync(tmp, serialize({ ...m, thread: m.thread || id }));
  renameSync(tmp, join(/* turbopackIgnore: true */ dir, folder, file));
  return file;
}

/**
 * Atomically writes a new INBOX message (`.<name>.tmp` then rename, so a scanner never sees a partial
 * file). With `thread`, it's a reply: hops = highest hops seen in that thread + 1, refused past MAX_HOPS.
 * Recipient validity is the caller's job (needs the tasks table).
 */
export function sendMessage(
  dir: string,
  input: { to: string; from: string; subject: string; body: string; thread?: string },
): Message {
  let hops = 0;
  if (input.thread) {
    const inThread = listMessages(dir).filter((m) => m.thread === input.thread);
    if (inThread.length === 0) throw new Error(`unknown thread "${input.thread}"`);
    hops = Math.max(...inThread.map((m) => m.hops)) + 1;
    if (hops > MAX_HOPS) throw new Error(`thread "${input.thread}" reached the ${MAX_HOPS}-hop limit`);
  }
  const file = write(dir, "INBOX", { ...input, thread: input.thread ?? "", hops, run: "" });
  return listMessages(dir).find((m) => m.file === file)!;
}

/** Files a run's final output in RESULTS, addressed `to: me` from the task (its "session id") and tagged with the run so the log can be read back from it. */
export function sendResult(dir: string, input: { from: string; run: string; subject: string; body: string }): Message {
  const file = write(dir, "RESULTS", { ...input, to: "me", thread: "", hops: 0 });
  return listResults(dir).find((m) => m.file === file)!;
}

/** Every readable result, newest first. */
export function listResults(dir: string): Message[] {
  ensure(dir);
  return mdFiles(dir, "RESULTS")
    .map((file) => parseMessage(file, readFileSync(join(/* turbopackIgnore: true */ dir, "RESULTS", file), "utf8"), "result"))
    .filter((m): m is Message => m !== null)
    .reverse();
}

const warned = new Set<string>();
/** Logs a problem file once per process — the scanner runs every few seconds and the file stays in INBOX. */
export function warnOnce(file: string, reason: string): void {
  if (warned.has(file)) return;
  warned.add(file);
  console.warn(`[mailbox] skipping ${file}: ${reason}`);
}

/** Pending INBOX messages, oldest first (= arrival order). Malformed files are skipped and logged; files over the hop cap (hand-written ones bypass send) go straight to DONE. */
export function scanInbox(dir: string): Message[] {
  ensure(dir);
  const pending: Message[] = [];
  for (const file of mdFiles(dir, "INBOX")) {
    const msg = parseMessage(file, readFileSync(join(/* turbopackIgnore: true */ dir, "INBOX", file), "utf8"), "inbox");
    if (!msg) warnOnce(file, "malformed front matter");
    else if (msg.hops > MAX_HOPS) {
      warnOnce(file, `over the ${MAX_HOPS}-hop cap, moved to DONE`);
      renameSync(join(/* turbopackIgnore: true */ dir, "INBOX", file), join(/* turbopackIgnore: true */ dir, "DONE", file));
    } else pending.push(msg);
  }
  return pending;
}

/** The next task to trigger: the recipient of the oldest message whose recipient is startable. Messages to unknown recipients are skipped and logged, never deleted. */
export function pickNext(
  pending: Message[],
  canStart: (taskId: string) => "yes" | "busy" | "unknown",
): string | null {
  for (const m of pending) {
    const state = canStart(m.to);
    if (state === "unknown") warnOnce(m.file, `unknown recipient "${m.to}"`);
    else if (state === "yes") return m.to;
  }
  return null;
}

/** Moves the messages INBOX → DONE. The rename is the claim: one that's already gone (claimed elsewhere) is left out of the result. */
export function claim(dir: string, messages: Message[]): Message[] {
  const claimed: Message[] = [];
  for (const m of messages) {
    try {
      renameSync(join(/* turbopackIgnore: true */ dir, "INBOX", m.file), join(/* turbopackIgnore: true */ dir, "DONE", m.file));
      claimed.push({ ...m, status: "done" });
    } catch {
      // already claimed or removed by hand
    }
  }
  return claimed;
}

/** The text prepended to a run's prompt for the messages it was just handed. */
export function formatInbox(messages: Message[], nameOf: (id: string) => string): string {
  if (messages.length === 0) return "";
  const items = messages.map((m) => `[from ${nameOf(m.from)} · thread ${m.thread} · subject ${m.subject}] ${m.body}`);
  return `--- Inbox (${messages.length} message${messages.length === 1 ? "" : "s"}) ---\n${items.join("\n\n")}\n\n`;
}
