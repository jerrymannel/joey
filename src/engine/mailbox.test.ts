import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { saveMailboxFolder } from "./settings.ts";
import { claim, ensureMailbox, formatInbox, listMessages, listResults, MAX_HOPS, parseMessage, pickNext, mailboxDir, scanInbox, sendMessage, sendResult } from "./mailbox.ts";

const dir = () => mkdtempSync(join(tmpdir(), "joey-mailbox-test-"));

test("send writes an atomic INBOX file that round-trips; new thread id is the message id, hops 0", () => {
  const d = dir();
  const m = sendMessage(d, { to: "t1", from: "human", subject: "Hi\nthere", body: "Body **md**" });
  assert.equal(m.thread, m.id);
  assert.equal(m.hops, 0);
  assert.equal(m.subject, "Hi there");
  assert.equal(m.body, "Body **md**");
  assert.ok(existsSync(join(d, "DONE")));
  assert.deepEqual(scanInbox(d).map((x) => x.file), [m.file]);
  rmSync(d, { recursive: true });
});

test("replies bump hops from the thread and are refused past MAX_HOPS", () => {
  const d = dir();
  let m = sendMessage(d, { to: "a", from: "human", subject: "s", body: "b" });
  for (let i = 1; i <= MAX_HOPS; i++) {
    m = sendMessage(d, { to: "a", from: "b", subject: "s", body: "b", thread: m.thread });
    assert.equal(m.hops, i);
  }
  assert.throws(() => sendMessage(d, { to: "a", from: "b", subject: "s", body: "b", thread: m.thread }), /hop limit/);
  assert.throws(() => sendMessage(d, { to: "a", from: "b", subject: "s", body: "b", thread: "nope" }), /unknown thread/);
  rmSync(d, { recursive: true });
});

test("scan: oldest first, ignores dotfiles, skips malformed (kept), moves over-cap files to DONE", () => {
  const d = dir();
  sendMessage(d, { to: "a", from: "human", subject: "s", body: "b" }); // creates the folders
  writeFileSync(join(d, "INBOX", "2000-01-01T00-00-00Z-old.md"), "---\nto: a\nfrom: human\nsubject: first\n---\nhand-written");
  writeFileSync(join(d, "INBOX", "2000-01-02T00-00-00Z-bad.md"), "no front matter");
  writeFileSync(join(d, "INBOX", "2000-01-03T00-00-00Z-loop.md"), `---\nto: a\nfrom: b\nhops: ${MAX_HOPS + 1}\n---\nx`);
  writeFileSync(join(d, "INBOX", ".partial.md.tmp"), "---\nto: a\nfrom: b\n---\n");

  const pending = scanInbox(d);
  assert.equal(pending.length, 2);
  assert.equal(pending[0].id, "old"); // hand-written: id from filename, thread defaults to it
  assert.equal(pending[0].thread, "old");
  assert.ok(existsSync(join(d, "INBOX", "2000-01-02T00-00-00Z-bad.md")));
  assert.ok(existsSync(join(d, "DONE", "2000-01-03T00-00-00Z-loop.md")));
  rmSync(d, { recursive: true });
});

test("claim moves to DONE exactly once; formatInbox renders the prompt prefix", () => {
  const d = dir();
  const m = sendMessage(d, { to: "a", from: "r1", subject: "Sum", body: "do it" });
  assert.equal(claim(d, [m]).length, 1);
  assert.equal(claim(d, [m]).length, 0); // already gone
  assert.deepEqual(listMessages(d).map((x) => x.status), ["done"]);
  assert.equal(
    formatInbox([m], () => "Researcher"),
    `--- Inbox (1 message) ---\n[from Researcher · thread ${m.thread} · subject Sum] do it\n\n`,
  );
  rmSync(d, { recursive: true });
});

test("pickNext takes the oldest message whose recipient can start, skipping busy/unknown", () => {
  const msg = (id: string, to: string) => parseMessage(`2000-01-01T00-00-00Z-${id}.md`, `---\nto: ${to}\nfrom: h\n---\n`, "inbox")!;
  const state: Record<string, "yes" | "busy" | "unknown"> = { ghost: "unknown", busy: "busy", free: "yes" };
  assert.equal(pickNext([msg("1", "ghost"), msg("2", "busy"), msg("3", "free")], (id) => state[id]), "free");
  assert.equal(pickNext([msg("1", "busy")], (id) => state[id]), null);
});

test("sendResult files a `to: me` message in RESULTS carrying the run id; it's never delivered or scanned as inbox mail", async () => {
  const d = dir();
  ensureMailbox(d);
  assert.ok(existsSync(join(d, "RESULTS")));
  const first = sendResult(d, { from: "task1", run: "run-a", subject: "One", body: "out 1" });
  await new Promise((r) => setTimeout(r, 5)); // filenames sort by ms timestamp
  const second = sendResult(d, { from: "task2", run: "run-b", subject: "Two", body: "out 2" });
  assert.equal(first.to, "me");
  assert.equal(first.from, "task1");
  assert.equal(first.run, "run-a");
  assert.equal(first.status, "result");
  assert.deepEqual(listResults(d).map((m) => m.run), ["run-b", "run-a"]); // newest first
  assert.equal(second.body, "out 2");
  assert.deepEqual(scanInbox(d), []);
  assert.deepEqual(listMessages(d), []);
  rmSync(d, { recursive: true });
});

test("mailboxDir is <cwd>/MAILBOX until a mailbox folder is saved, then follows the setting", () => {
  const d = dir();
  process.env.SETTINGS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex"); // settings are encrypted at rest
  process.env.DATA_DB_PATH = join(d, "data.db");
  assert.equal(mailboxDir(), join(process.cwd(), "MAILBOX"));
  saveMailboxFolder(join(d, "elsewhere"));
  assert.equal(mailboxDir(), join(d, "elsewhere", "MAILBOX"));
  ensureMailbox(mailboxDir()); // what the settings API does on save
  assert.ok(existsSync(join(d, "elsewhere", "MAILBOX", "RESULTS")));
  delete process.env.DATA_DB_PATH;
  rmSync(d, { recursive: true });
});
