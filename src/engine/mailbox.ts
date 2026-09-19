import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getMailAccount, getResultsFolder } from "./settings.ts";
import { log } from "./logger.ts";
import { promptFile } from "./prompt-files.ts";
import { extractBody, fetchMessages, headerValue, isUnread, modifyLabels, sendEmail, type GmailMessage } from "./gmail.ts";

const mlog = log("mailbox");

/**
 * Agent mail. Agents (and a human) talk over one real Gmail inbox — the account chosen in General settings
 * (`getMailAccount`, e.g. manneljoey@gmail.com). Each job is reachable at `manneljoey+<job id>@gmail.com`
 * (`mailAddress`); the inbox scheduler polls for unread mail, and mail to a job's address triggers that job's
 * next run, which reads it (= marks it read, `claim`). Agent-sent mail carries `X-Joey-From` (sender's job id),
 * `X-Joey-Run` and `X-Joey-Hops` headers; a human's has none.
 *
 * A run ends with one email (`deliverResult`): its result, mailed to `manneljoey+results@gmail.com` (closes the
 * task), or — when the agent names one — a hand-off mail to another agent's address. Either way a copy is filed as
 * `<results folder>/<ISO timestamp>-<id>.md` (front matter `from`, `run`, `to`, `subject`, + markdown body): the
 * durable record the Results page and run log read, and how a run is known to have sent its result.
 */

/** A reply carries hops + 1; anything above this is refused (sendMail/nextHops) or marked read untriggered (scanInbox). */
export const MAX_HOPS = 5;

// ---- results (files) ----

export interface Result {
  /** Filename, e.g. `2026-09-18T10-00-00-123Z-a1b2c3.md` — sorts chronologically. */
  file: string;
  id: string;
  /** `Job name (job id)` — see `ref`. */
  from: string;
  /** The run this result reports on. */
  run: string;
  /** The agent (job id) the run handed off to instead of closing; empty for a closing result. */
  to: string;
  subject: string;
  body: string;
  /** ISO time parsed from the filename; null for hand-named files that don't follow the pattern. */
  sentAt: string | null;
}

/** The address tag closing results are mailed to — `manneljoey+results@gmail.com`. Not a job. */
export const RESULTS_ID = "results";

/** `Job name (job id)` — how a task is written in a result's `from`. */
export function ref(name: string, id: string): string {
  const n = name.replace(/\s+/g, " ").trim();
  return n ? `${n} (${id})` : id;
}

/** The job id in a `Job name (job id)` ref; anything else (a bare id) is returned as is. */
export function idOf(r: string): string {
  return /\(([^()\s]+)\)$/.exec(r)?.[1] ?? r;
}

/** A ref for display: `Job name (job id)`, looking the name up for bare ids. */
export function labelOf(r: string, nameOf: (id: string) => string | undefined): string {
  const name = idOf(r) === r ? nameOf(r) : undefined;
  return name ? ref(name, r) : r;
}

/** `2026-09-18T10-00-00[-123]Z-id.md` → ISO string; null for hand-named files that don't follow the pattern. */
export function sentAt(file: string): string | null {
  const m = /^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)(?:-(\d{3}))?Z-/.exec(file);
  return m ? `${m[1]}:${m[2]}:${m[3]}.${m[4] ?? "000"}Z` : null;
}

// The results folder is a user-set local folder, not a project asset: the turbopackIgnore comments below stop
// Turbopack tracing the whole repo for the dynamic path (same as db.ts).

/** Creates the results folder (a no-op if it exists) — also called when the setting changes, so the new location is ready. */
export function ensureResultsDir(dir: string): void {
  mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
}

/** Returns null when the text has no front matter or no `from`. */
export function parseResult(file: string, text: string): Result | null {
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) return null;
  const fields: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!fields.from) return null;
  return {
    file,
    id: file.replace(/\.md$/, "").replace(/^\d{4}-\d\d-\d\dT[\d-]+Z-/, ""),
    from: fields.from,
    run: fields.run ?? "",
    to: fields.to ?? "",
    subject: fields.subject ?? "",
    body: (m[2] ?? "").trim(),
    sentAt: sentAt(file),
  };
}

/** Files a run's final output in the results folder, tagged with the run so its log can be read back from it. Written atomically (`.<name>.tmp` then rename) so a reader never sees a partial file. */
export function sendResult(dir: string, input: { from: string; run: string; subject: string; body: string; to?: string }): Result {
  const id = randomBytes(3).toString("hex");
  // ms resolution (the spec'd name has seconds only) so two results in one second still sort in order.
  const file = `${new Date().toISOString().replace(/[:.]/g, "-")}-${id}.md`;
  const subject = input.subject.replace(/\s+/g, " ").trim(); // front matter is one line per key
  ensureResultsDir(dir);
  const tmp = join(/* turbopackIgnore: true */ dir, `.${file}.tmp`);
  writeFileSync(tmp, `---\nfrom: ${input.from}\nrun: ${input.run}\nto: ${input.to ?? ""}\nsubject: ${subject}\n---\n${input.body}\n`);
  renameSync(tmp, join(/* turbopackIgnore: true */ dir, file));
  mlog.info({ file, from: input.from, run: input.run, subject }, "result filed");
  return listResults(dir).find((r) => r.file === file)!;
}

/**
 * A run's final email. Without `to`: the result is mailed to `<account>+results@…` (filed read) and the task is
 * closed; the file is written first (it's the durable record), so a failed mail is logged and reported, not fatal.
 * With `to` (an agent's job id): a hand-off mail to that agent, which triggers its next run — mailed first and
 * fatal on failure, since the other agent would never hear of it. With no agent mailbox account set, a closing
 * result is only filed.
 */
export async function deliverResult(
  dir: string,
  input: { taskId: string; from: string; run: string; subject: string; body: string; to?: string; hops?: number; prompt?: string },
): Promise<{ result: Result; emailed: boolean; emailError?: string }> {
  const mail = () =>
    sendMail({ jobId: input.to || RESULTS_ID, from: input.taskId, subject: input.subject, body: input.body, run: input.run, hops: input.hops, prompt: input.prompt, unread: !!input.to });
  if (!getMailAccount()) {
    if (input.to) throw new Error("agent mail is off — choose an agent mailbox in General settings to hand off to another agent");
    mlog.warn({ run: input.run }, "no agent mailbox account — the result is filed, not emailed");
    return { result: sendResult(dir, input), emailed: false, emailError: "no agent mailbox account" };
  }
  if (input.to) {
    await mail();
    return { result: sendResult(dir, input), emailed: true };
  }
  const result = sendResult(dir, input);
  try {
    await mail();
    return { result, emailed: true };
  } catch (err) {
    const emailError = err instanceof Error ? err.message : String(err);
    mlog.error({ run: input.run, err: emailError }, "the result is filed but emailing it failed");
    return { result, emailed: false, emailError };
  }
}

/** Every readable result, newest first; dotfiles and malformed files are ignored. */
export function listResults(dir: string): Result[] {
  ensureResultsDir(dir);
  return readdirSync(/* turbopackIgnore: true */ dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("."))
    .sort()
    .map((file) => parseResult(file, readFileSync(join(/* turbopackIgnore: true */ dir, file), "utf8")))
    .filter((r): r is Result => r !== null)
    .reverse();
}

/** `<results folder setting>` (defaults to `<cwd>/results`). */
export function resultsDir(): string {
  return getResultsFolder();
}

// ---- mail (Gmail) ----

export interface Mail {
  id: string;
  threadId: string;
  /** The `From` header. */
  from: string;
  /** The sending agent's job id (`X-Joey-From`); empty for a human's / outside mail. */
  agent: string;
  to: string;
  /** The job id in a `local+<job id>@domain` recipient address; empty when the mail isn't addressed to a job. */
  jobId: string;
  subject: string;
  /** ISO time the mail arrived. */
  sentAt: string;
  body: string;
  unread: boolean;
  /** The run that sent this mail (`X-Joey-Run`); empty for a human's. */
  run: string;
  hops: number;
}

function requireAccount(): string {
  const account = getMailAccount();
  if (!account) throw new Error("No agent mailbox account — choose a connected Gmail account in General settings first");
  return account;
}

/** `manneljoey@gmail.com` + `abc` → `manneljoey+abc@gmail.com`. */
export function mailAddress(account: string, jobId: string): string {
  const [local, domain] = account.split("@");
  return `${local}+${jobId}@${domain}`;
}

/** The job id in the first `<account local>+<id>@<account domain>` address found in the given header values; "" if none. */
export function jobIdIn(account: string, ...headers: string[]): string {
  const [local, domain] = account.split("@").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![\\w.+-])${local}\\+([\\w-]+)@${domain}`, "i");
  for (const h of headers) {
    const id = re.exec(h)?.[1];
    if (id) return id;
  }
  return "";
}

export function toMail(m: GmailMessage, account: string): Mail {
  const h = (name: string) => headerValue(m.payload.headers, name);
  return {
    id: m.id,
    threadId: m.threadId,
    from: h("From"),
    agent: h("X-Joey-From"),
    to: h("To"),
    jobId: jobIdIn(account, h("To"), h("Cc")),
    subject: h("Subject"),
    sentAt: new Date(Number(m.internalDate) || 0).toISOString(),
    body: extractBody(m.payload).trim(),
    unread: isUnread(m.labelIds),
    run: h("X-Joey-Run"),
    hops: Number(h("X-Joey-Hops")) || 0,
  };
}

/** Recent mail matching a Gmail search, newest first — for the UI. */
export async function searchMail(query: string, maxResults = 25): Promise<Mail[]> {
  const account = requireAccount();
  const mails = (await fetchMessages(query, account, maxResults)).map((m) => toMail(m, account));
  return mails.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/** The hop count for a message sent from a run that was handed mail with at most `deliveredHops` (`MAIL_HOPS`, unset when it was handed none). Throws past MAX_HOPS. */
export function nextHops(deliveredHops: string | undefined): number {
  const hops = deliveredHops === undefined || deliveredHops === "" ? 0 : Number(deliveredHops) + 1;
  if (!Number.isInteger(hops) || hops > MAX_HOPS) {
    mlog.warn({ deliveredHops }, `reached the ${MAX_HOPS}-hop limit — not sending`);
    throw new Error(`reached the ${MAX_HOPS}-hop limit — not sending`);
  }
  return hops;
}

/**
 * Sends mail to a job's address `<account local>+<jobId>@<domain>`. `from` is the sending agent's job id, empty
 * for a human; From is always the mailbox account, Reply-To the sender's own address, so a reply routes back to it. `prompt` (the sender's
 * original prompt) is appended to the body — pass it on the first message of a chain only. Recipient validity is
 * the caller's job (needs the tasks table).
 */
export async function sendMail(input: { jobId: string; from: string; subject: string; body: string; run?: string; hops?: number; prompt?: string; unread?: boolean }): Promise<{ id: string; hops: number }> {
  const account = requireAccount();
  const hops = input.hops ?? 0;
  // From is always the mailbox account itself (never a per-job address); who sent it is in X-Joey-From / Reply-To.
  const headers: Record<string, string> = { From: account, To: mailAddress(account, input.jobId), Subject: input.subject, "X-Joey-Hops": String(hops) };
  if (input.from) {
    headers["X-Joey-From"] = input.from;
    headers["Reply-To"] = mailAddress(account, input.from);
  }
  if (input.run) headers["X-Joey-Run"] = input.run;
  const body = input.prompt ? promptFile("sender-prompt", { body: input.body, prompt: input.prompt }) : input.body;
  const id = await sendEmail(headers, body, account);
  // Sent to our own address, Gmail may file the copy as read; force it into the inbox unread so the poller sees it
  // (`unread: false` — a closing result nobody polls for — files it read instead).
  const unread = input.unread ?? true;
  await modifyLabels(id, unread ? ["INBOX", "UNREAD"] : ["INBOX"], unread ? [] : ["UNREAD"], account);
  mlog.info({ id, to: input.jobId, from: input.from || "human", subject: input.subject, hops, run: input.run }, "mail sent");
  return { id, hops };
}

const warned = new Set<string>();
/** Logs a problem once per process (later repeats go to debug) — the poller runs every few seconds and the same mail stays unread. */
export function warnOnce(key: string, message: string, level: "warn" | "error" = "warn"): void {
  if (warned.has(key)) return mlog.debug(message);
  warned.add(key);
  mlog[level](message);
}

/** Unread inbox mail addressed to a job, oldest first (= arrival order). Over-hop-cap mail (only hand-crafted headers get here) is marked read untriggered. Mail not addressed to a job is left alone. */
export async function scanInbox(): Promise<Mail[]> {
  const account = requireAccount();
  const unread = (await fetchMessages("in:inbox is:unread", account, 25)).map((m) => toMail(m, account));
  mlog.debug({ unread: unread.length, forJobs: unread.filter((m) => m.jobId).length }, "inbox scanned");
  const pending: Mail[] = [];
  for (const m of unread.sort((a, b) => a.sentAt.localeCompare(b.sentAt))) {
    if (!m.jobId || m.jobId === RESULTS_ID) continue; // not for a job (a closing result is never picked up)
    if (m.hops > MAX_HOPS) {
      warnOnce(m.id, `mail ${m.id} is over the ${MAX_HOPS}-hop cap, marked read`);
      await modifyLabels(m.id, [], ["UNREAD"], account);
    } else pending.push(m);
  }
  return pending;
}

/** The next task to trigger: the recipient of the oldest mail whose recipient is startable. Mail to unknown recipients is skipped and logged, never touched. */
export function pickNext(pending: Mail[], canStart: (taskId: string) => "yes" | "busy" | "unknown"): string | null {
  for (const m of pending) {
    const state = canStart(m.jobId);
    if (state === "unknown") warnOnce(m.id, `mail ${m.id} is for unknown recipient "${m.jobId}"`);
    else if (state === "yes") return m.jobId;
  }
  return null;
}

/**
 * Marks the mail read = hands it to a run; one that fails to be marked is left out (it stays unread for the next run).
 * ponytail: not atomic — two processes (the app's poller and `start-run`) claiming at the same instant could
 * deliver the same mail twice. Gmail has no compare-and-set on labels; add a lock if that ever bites.
 */
export async function claim(mails: Mail[]): Promise<Mail[]> {
  const account = requireAccount();
  const results = await Promise.allSettled(mails.map((m) => modifyLabels(m.id, [], ["UNREAD"], account)));
  results.forEach((r, i) => r.status === "rejected" && mlog.warn({ id: mails[i].id }, `couldn't mark mail read, it stays unread: ${r.reason}`));
  const claimed = mails.filter((_, i) => results[i].status === "fulfilled");
  if (claimed.length > 0) mlog.info({ ids: claimed.map((m) => m.id) }, `${claimed.length} mail(s) handed to a run`);
  return claimed;
}

/** The text prepended to a run's prompt for the mail it was just handed. */
export function formatInbox(mails: Mail[], nameOf: (id: string) => string | undefined): string {
  if (mails.length === 0) return "";
  const items = mails.map((m) => `[from ${m.agent ? labelOf(m.agent, nameOf) : m.from} · subject ${m.subject}] ${m.body}`);
  const heading = promptFile("inbox", { count: mails.length, noun: mails.length === 1 ? "message" : "messages" });
  return `${heading}\n${items.join("\n\n")}\n\n`;
}
