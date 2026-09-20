import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { base64UrlDecode, base64UrlEncode, type GmailMessage } from "./gmail.ts";
import { addGmailAccount, getResultsFolder, saveGmailApp, saveMailAccount, saveResultsFolder, saveUserEmail } from "./settings.ts";
import { claim, deliverResult, formatInbox, idOf, jobIdIn, labelOf, listResults, mailAddress, MAX_HOPS, nextHops, pickNext, ref, resultsDir, scanInbox, sendMail, sendResult, toMail, type Mail } from "./mailbox.ts";

const dir = () => mkdtempSync(join(tmpdir(), "joey-mailbox-test-"));
// db.ts opens its handle once per process, so every test shares this one settings DB.
const root = dir();
process.env.SETTINGS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex"); // settings are encrypted at rest
process.env.DATA_DB_PATH = join(root, "data.db");
after(() => rmSync(root, { recursive: true }));
const ACCOUNT = "manneljoey@gmail.com";

/** A Gmail API message as `fetchMessages` returns it. */
function gmailMsg(id: string, headers: Record<string, string>, opts: { unread?: boolean; at?: number; body?: string } = {}): GmailMessage {
  return {
    id,
    threadId: `th-${id}`,
    snippet: "",
    labelIds: opts.unread === false ? ["INBOX"] : ["INBOX", "UNREAD"],
    internalDate: String(opts.at ?? 1000),
    payload: {
      mimeType: "text/plain",
      body: { data: base64UrlEncode(opts.body ?? "hello") },
      headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
    },
  };
}

test("mailAddress/jobIdIn round-trip plus-addresses and ignore other recipients", () => {
  assert.equal(mailAddress(ACCOUNT, "abc123"), "manneljoey+abc123@gmail.com");
  assert.equal(jobIdIn(ACCOUNT, "Joey <manneljoey+abc123@gmail.com>"), "abc123");
  assert.equal(jobIdIn(ACCOUNT, "other@x.com", "a@b.c, MANNELJOEY+dead-beef@Gmail.com"), "dead-beef"); // 2nd header, case-insensitive
  assert.equal(jobIdIn(ACCOUNT, "manneljoey@gmail.com"), ""); // the bare address isn't a job
  assert.equal(jobIdIn(ACCOUNT, "xmanneljoey+abc@gmail.com"), ""); // a different account that merely ends the same
  assert.equal(jobIdIn("a.b@gmail.com", "aXb+1@gmail.com"), ""); // "." in the account is escaped, not a wildcard
});

test("toMail reads agent headers; a human's mail has none", () => {
  const agent = toMail(gmailMsg("m1", { To: mailAddress(ACCOUNT, "bob"), From: ACCOUNT, Subject: "Hi", "X-Joey-From": "alice", "X-Joey-Run": "r1", "X-Joey-Hops": "2" }, { at: 5000 }), ACCOUNT);
  assert.deepEqual([agent.jobId, agent.agent, agent.run, agent.hops, agent.unread, agent.subject, agent.body], ["bob", "alice", "r1", 2, true, "Hi", "hello"]);
  assert.equal(agent.sentAt, "1970-01-01T00:00:05.000Z");
  const human = toMail(gmailMsg("m2", { To: mailAddress(ACCOUNT, "bob"), From: "Me <me@x.com>" }, { unread: false }), ACCOUNT);
  assert.deepEqual([human.agent, human.run, human.hops, human.unread], ["", "", 0, false]);
});

test("nextHops: 0 with no delivered mail, +1 otherwise, refused past MAX_HOPS", () => {
  assert.equal(nextHops(undefined), 0);
  assert.equal(nextHops("0"), 1);
  assert.equal(nextHops(String(MAX_HOPS - 1)), MAX_HOPS);
  assert.throws(() => nextHops(String(MAX_HOPS)), /hop limit/);
});

test("pickNext takes the oldest mail whose recipient can start, skipping busy/unknown", () => {
  const mail = (id: string, jobId: string) => ({ id, jobId }) as Mail;
  const state: Record<string, "yes" | "busy" | "unknown"> = { ghost: "unknown", busy: "busy", free: "yes" };
  assert.equal(pickNext([mail("1", "ghost"), mail("2", "busy"), mail("3", "free")], (id) => state[id]), "free");
  assert.equal(pickNext([mail("4", "busy")], (id) => state[id]), null);
});

test("formatInbox renders the prompt prefix, naming agent senders by ref and leaving outside senders as is", () => {
  const agent = { agent: "a1", from: ACCOUNT, subject: "Sum", body: "do it" } as Mail;
  const outside = { agent: "", from: "Me <me@x.com>", subject: "Yo", body: "hi" } as Mail;
  assert.equal(
    formatInbox([agent, outside], (id) => (id === "a1" ? "Sender" : undefined)),
    "--- Inbox (2 messages) ---\n[from Sender (a1) · subject Sum] do it\n\n[from Me <me@x.com> · subject Yo] hi\n\n",
  );
  assert.equal(formatInbox([], () => undefined), "");
});

test("refs: `Job name (job id)` routes by id", () => {
  assert.equal(ref("Job  one\n", "abc"), "Job one (abc)");
  assert.equal(idOf("Job one (abc)"), "abc");
  assert.equal(idOf("abc"), "abc");
  assert.equal(labelOf("abc", () => "Job one"), "Job one (abc)");
  assert.equal(labelOf("Job one (abc)", () => "renamed"), "Job one (abc)");
});

test("results are flat files in the results folder: newest first, dotfiles/malformed ignored, folder created on demand", async () => {
  const d = join(dir(), "results"); // doesn't exist yet
  const first = sendResult(d, { from: ref("T1", "task1"), run: "run-a", subject: "One\nline", body: "out 1" });
  await new Promise((r) => setTimeout(r, 5)); // filenames sort by ms timestamp
  const second = sendResult(d, { from: "task2", run: "run-b", subject: "Two", body: "out 2" });
  writeFileSync(join(d, "bad.md"), "no front matter");
  writeFileSync(join(d, ".partial.md.tmp"), "---\nfrom: x\n---\n");
  assert.equal(first.subject, "One line");
  assert.equal(first.from, "T1 (task1)");
  assert.equal(second.body, "out 2");
  assert.ok(first.sentAt);
  assert.deepEqual(listResults(d).map((r) => r.run), ["run-b", "run-a"]);
  assert.deepEqual(existsSync(join(d, "INBOX")), false); // no subfolders
  rmSync(join(d, ".."), { recursive: true });
});

/** A throwaway settings DB with the agent mailbox account connected, and a stubbed `fetch` standing in for Google. */
function withGmail(handler: (url: string, init?: RequestInit) => unknown) {
  saveGmailApp({ clientId: "id", clientSecret: "secret" });
  addGmailAccount({ email: ACCOUNT, refreshToken: "rt" });
  saveMailAccount(ACCOUNT);
  const calls: { url: string; init?: RequestInit }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = String(url).includes("oauth2.googleapis.com/token") ? { access_token: "at" } : handler(String(url), init);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return {
    calls,
    done() {
      globalThis.fetch = realFetch;
    },
  };
}

test("scanInbox: unread mail to jobs only, oldest first; over-cap mail is marked read untriggered; claim marks read", async () => {
  const msgs: Record<string, GmailMessage> = {
    new: gmailMsg("new", { To: mailAddress(ACCOUNT, "b"), Subject: "later" }, { at: 3000 }),
    old: gmailMsg("old", { To: mailAddress(ACCOUNT, "a"), Subject: "first" }, { at: 1000 }),
    news: gmailMsg("news", { To: ACCOUNT, Subject: "newsletter" }, { at: 2000 }), // not for a job: left alone
    res: gmailMsg("res", { To: mailAddress(ACCOUNT, "results") }, { at: 1500 }), // a closing result: never picked up
    loop: gmailMsg("loop", { To: mailAddress(ACCOUNT, "a"), "X-Joey-Hops": String(MAX_HOPS + 1) }, { at: 500 }),
  };
  const g = withGmail((url) => {
    if (url.includes("/messages?q=")) return { messages: Object.keys(msgs).map((id) => ({ id })) };
    const full = /\/messages\/(\w+)\?format=full/.exec(url);
    return full ? msgs[full[1]] : {}; // else a /modify
  });
  try {
    const pending = await scanInbox();
    assert.deepEqual(pending.map((m) => m.id), ["old", "new"]);
    assert.match(decodeURIComponent(g.calls.find((c) => c.url.includes("?q="))!.url), /in:inbox is:unread/);
    const modifies = () => g.calls.filter((c) => c.url.endsWith("/modify"));
    assert.deepEqual(modifies().map((c) => [c.url.split("/").at(-2), JSON.parse(String(c.init!.body))]), [["loop", { addLabelIds: [], removeLabelIds: ["UNREAD"] }]]);
    assert.deepEqual((await claim(pending)).map((m) => m.id), ["old", "new"]);
    assert.equal(modifies().length, 3);
  } finally {
    g.done();
  }
});

test("sendMail addresses the job, carries the agent headers, appends the prompt, and forces the copy into the inbox unread", async () => {
  const g = withGmail((url) => (url.endsWith("/messages/send") ? { id: "sent1" } : {}));
  try {
    const r = await sendMail({ jobId: "bob", from: "alice", fromName: "Alice \"the\" Agent", subject: "Zürich — plan", body: "go", run: "run1", hops: 1, prompt: "be nice" });
    assert.deepEqual(r, { id: "sent1", hops: 1 });
    const send = g.calls.find((c) => c.url.endsWith("/messages/send"))!;
    const raw = base64UrlDecode(JSON.parse(String(send.init!.body)).raw);
    const [head, body] = raw.split("\r\n\r\n");
    assert.match(head, /^From: "Joey" <manneljoey@gmail\.com>$/m);
    assert.match(head, /^To: manneljoey\+bob@gmail\.com$/m);
    assert.match(head, /^Reply-To: "Alice \\"the\\" Agent" <manneljoey\+alice@gmail\.com>$/m);
    assert.match(head, /^X-Joey-From: alice$/m);
    assert.match(head, /^X-Joey-Run: run1$/m);
    assert.match(head, /^X-Joey-Hops: 1$/m);
    const subject = /^Subject: =\?UTF-8\?B\?(.+)\?=$/m.exec(head)![1]; // non-ASCII → encoded-word
    assert.equal(Buffer.from(subject, "base64").toString(), "Zürich — plan");
    assert.equal(body, "go\n\n--- Sender's prompt ---\nbe nice");
    const modify = g.calls.find((c) => c.url.endsWith("/sent1/modify"))!;
    assert.deepEqual(JSON.parse(String(modify.init!.body)), { addLabelIds: ["INBOX", "UNREAD"], removeLabelIds: [] });

    await sendMail({ jobId: "bob", from: "", subject: "hi", body: "x" }); // a human: no agent headers
    const human = base64UrlDecode(JSON.parse(String(g.calls.filter((c) => c.url.endsWith("/messages/send")).at(-1)!.init!.body)).raw);
    assert.doesNotMatch(human, /X-Joey-From|Reply-To|X-Joey-Run/);
    assert.match(human, /^From: "Joey" <manneljoey@gmail\.com>$/m);
  } finally {
    g.done();
  }
});

const sent = (g: ReturnType<typeof withGmail>) =>
  g.calls.filter((c) => c.url.endsWith("/messages/send")).map((c) => base64UrlDecode(JSON.parse(String(c.init!.body)).raw));
const labelChanges = (g: ReturnType<typeof withGmail>) => g.calls.filter((c) => c.url.endsWith("/modify")).map((c) => JSON.parse(String(c.init!.body)));

test("deliverResult with no `to`: files the result and mails it to +results, filed read — the task is closed", async () => {
  const d = join(dir(), "results");
  const g = withGmail((url) => (url.endsWith("/messages/send") ? { id: "res1" } : {}));
  try {
    const r = await deliverResult(d, { taskId: "alice", from: ref("Alice", "alice"), run: "run1", subject: "Done", body: "the output" });
    assert.equal(r.emailed, true);
    assert.deepEqual([r.result.from, r.result.run, r.result.to, r.result.body], ["Alice (alice)", "run1", "", "the output"]);
    const [mail] = sent(g);
    assert.match(mail, /^From: "Joey" <manneljoey@gmail\.com>$/m);
    assert.match(mail, /^To: manneljoey\+results@gmail\.com$/m);
    assert.match(mail, /^X-Joey-From: alice$/m);
    assert.match(mail, /^X-Joey-Run: run1$/m);
    assert.match(mail, /the output$/);
    assert.deepEqual(labelChanges(g), [{ addLabelIds: ["INBOX"], removeLabelIds: ["UNREAD"] }]);
  } finally {
    g.done();
    rmSync(join(d, ".."), { recursive: true });
  }
});

test("deliverResult with a user email set: mails the result there (no label changes) instead of +results", async () => {
  const d = join(dir(), "results");
  const g = withGmail((url) => (url.endsWith("/messages/send") ? { id: "res2" } : {}));
  saveUserEmail("me@example.com");
  try {
    await deliverResult(d, { taskId: "alice", from: ref("Alice", "alice"), run: "run1", subject: "Done", body: "the output" });
    const [mail] = sent(g);
    assert.match(mail, /^From: "Joey" <manneljoey@gmail\.com>$/m);
    assert.match(mail, /^To: me@example\.com$/m);
    assert.deepEqual(labelChanges(g), []);
  } finally {
    saveUserEmail("");
    g.done();
    rmSync(join(d, ".."), { recursive: true });
  }
});

test("deliverResult with `to`: hands off by mailing that agent (unread, so it triggers), then files the result with the recipient", async () => {
  const d = join(dir(), "results");
  const g = withGmail((url) => (url.endsWith("/messages/send") ? { id: "hand1" } : {}));
  try {
    const r = await deliverResult(d, { taskId: "alice", from: ref("Alice", "alice"), run: "run1", subject: "Over to you", body: "next step", to: "bob", hops: 1, prompt: "be nice" });
    assert.equal(r.result.to, "bob");
    const [mail] = sent(g);
    assert.match(mail, /^To: manneljoey\+bob@gmail\.com$/m);
    assert.match(mail, /^X-Joey-Hops: 1$/m);
    assert.match(mail, /next step\n\n--- Sender's prompt ---\nbe nice$/);
    assert.deepEqual(labelChanges(g), [{ addLabelIds: ["INBOX", "UNREAD"], removeLabelIds: [] }]);
  } finally {
    g.done();
    rmSync(join(d, ".."), { recursive: true });
  }
});

test("deliverResult: a failed closing mail is reported but the result stays filed; a failed hand-off files nothing", async () => {
  const d = join(dir(), "results");
  const g = withGmail(() => {
    throw new Error("gmail down");
  });
  try {
    const closing = await deliverResult(d, { taskId: "a", from: "a", run: "r1", subject: "s", body: "b" });
    assert.equal(closing.emailed, false);
    assert.match(closing.emailError!, /gmail down/);
    assert.equal(listResults(d).length, 1);
    await assert.rejects(deliverResult(d, { taskId: "a", from: "a", run: "r2", subject: "s", body: "b", to: "bob" }), /gmail down/);
    assert.equal(listResults(d).length, 1); // still just the closing one
  } finally {
    g.done();
    rmSync(join(d, ".."), { recursive: true });
  }
});

test("deliverResult with agent mail off: a closing result is only filed; a hand-off is refused", async () => {
  const d = join(dir(), "results");
  saveMailAccount("");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => assert.fail("no request expected")) as typeof fetch;
  try {
    const r = await deliverResult(d, { taskId: "a", from: "a", run: "r1", subject: "s", body: "b" });
    assert.deepEqual([r.emailed, r.emailError], [false, "no agent mailbox account"]);
    assert.equal(listResults(d).length, 1);
    await assert.rejects(deliverResult(d, { taskId: "a", from: "a", run: "r2", subject: "s", body: "b", to: "bob" }), /agent mail is off/);
  } finally {
    globalThis.fetch = realFetch;
    saveMailAccount(ACCOUNT);
    rmSync(join(d, ".."), { recursive: true });
  }
});

test("mail calls without an agent mailbox account say what to set up, without touching the network", async () => {
  saveMailAccount("");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => assert.fail("no request expected")) as typeof fetch;
  try {
    await assert.rejects(scanInbox(), /General settings/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("resultsDir is <cwd>/results until a results folder is saved, then follows the setting", () => {
  const d = dir();
  assert.equal(resultsDir(), join(process.cwd(), "results"));
  saveResultsFolder(join(d, "elsewhere"));
  assert.equal(resultsDir(), join(d, "elsewhere"));
  assert.equal(getResultsFolder(), join(d, "elsewhere"));
  rmSync(d, { recursive: true });
});
