import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeHerdr } from "../test-support/fake-herdr.ts";

const dir = mkdtempSync(join(tmpdir(), "joey-task-run-test-"));
const home = join(dir, "home");
process.env.DATA_DB_PATH = join(dir, "data.db");
process.env.JOEY_HOME = home;
process.env.SETTINGS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");
installFakeHerdr(dir);

/**
 * Stands in for pi: replies per agent, from the session's turn count. The summariser writes "draft N" on each turn; the reviewer asks for a
 * revision on its first review and approves the second — unless ALWAYS_REVISE is set.
 */
const fakeAgent = join(dir, "fake-agent.cjs");
writeFileSync(
  fakeAgent,
  `const fs = require("node:fs");
const [name, text, sessionDir] = process.argv.slice(2);
const file = sessionDir + "/session.jsonl";
const turns = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\\n").filter((l) => l.includes('"user"')).length : 0;
let reply;
if (name.includes("reviewer")) {
  const revise = process.env.ALWAYS_REVISE || turns === 0;
  fs.writeFileSync(sessionDir + "/verdict.json", JSON.stringify(revise ? { verdict: "revise", feedback: "add the dates" } : { verdict: "approve", feedback: "good" }));
  reply = revise ? "needs dates" : "ok";
} else reply = "draft " + (turns + 1);
const line = (message) => JSON.stringify({ type: "message", message }) + "\\n";
fs.appendFileSync(file, line({ role: "user", content: [{ type: "text", text }] }) + line({ role: "assistant", content: [{ type: "text", text: reply }], stopReason: "stop" }));
`,
);
process.env.JOEY_FAKE_AGENT = fakeAgent;

mkdirSync(join(home, "tasks"), { recursive: true });
mkdirSync(join(home, "prompts"), { recursive: true });
mkdirSync(join(home, "scripts", "fetch"), { recursive: true });
writeFileSync(join(home, "prompts", "summariser.md"), "You summarise email.");
writeFileSync(join(home, "prompts", "reviewer.md"), "You review summaries.");
writeFileSync(join(home, "scripts", "fetch", "fetch.sh"), '#!/bin/sh\necho "fetching $(echo "$JOEY_PARAMS")"\n[ -n "$FAIL" ] && exit 3\nprintf "3 emails" > "$STEP_OUTPUT"\n');
chmodSync(join(home, "scripts", "fetch", "fetch.sh"), 0o755);
writeFileSync(
  join(home, "scripts", "fetch", "config.yaml"),
  `command: fetch.sh
params:
  query: { required: true }
`,
);

const digest = (extra = "") => `name: Digest
steps:
  - script: fetch
    params: { query: "is:unread" }
  - agent: { model: fake/model }
    instructions: Summarise.
  - agent: { model: fake/model }
    instructionsFile: reviewer.md
    reviews: 2
${extra}  - agent: { model: fake/model }
    instructions: Final.
`;

const { saveWorkspaceFolder } = await import("./settings.ts");
const { startTaskRun } = await import("./task-run.ts");
const { getTaskRun, listRunSteps } = await import("./task-runs.ts");
const { loadTask } = await import("./definitions.ts");
const { herdrAgentName, HERDR_AGENT_NAME } = await import("./agent-session.ts");
saveWorkspaceFolder(join(dir, "ws"));

async function finished(runId: string) {
  for (let i = 0; i < 200; i++) {
    const run = getTaskRun(runId)!;
    if (run.status !== "running") return run;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("run never finished");
}

test("a run pipes script output into the agents, loops the review until approved, and ends with the last step's output as the result", async () => {
  writeFileSync(join(home, "tasks", "daily-inbox-digest.yaml"), digest());
  const run = await finished(startTaskRun("daily-inbox-digest").runId); // a long name: herdr agent names are capped at 32 characters
  assert.equal(run.status, "completed", run.log);
  assert.ok(run.runDir.startsWith(join(dir, "ws", "daily-inbox-digest")));

  const steps = listRunSteps(run.id);
  assert.deepEqual(steps.map((s) => s.status), ["completed", "completed", "completed", "completed"]);
  assert.equal(steps[2].note, "approved in round 2");

  const out = (n: string) => readFileSync(join(run.runDir, "steps", n), "utf8");
  assert.equal(out("01-fetch.md"), "3 emails");
  assert.equal(out("02-agent.md"), "draft 1");
  assert.equal(out("02-agent.r2.md"), "draft 2"); // revised on the reviewer's feedback, in that step's own session
  assert.equal(out("03-reviewer.md"), "draft 2"); // a review step's output is the latest reviewed version
  assert.equal(out("04-agent.md"), "draft 1"); // step 4 is its own fresh session — it doesn't remember step 2
  assert.equal(readFileSync(join(run.runDir, "result.md"), "utf8"), "draft 1");
  assert.match(out("01-fetch.log"), /fetching \{"query":"is:unread"\}/);

  const session = (d: string) => readFileSync(join(run.runDir, "sessions", d, "session.jsonl"), "utf8");
  const summariser = session("02-agent");
  assert.match(summariser, /Summarise\./); // its instructions (no separate briefing any more)
  assert.match(summariser, /3 emails/); // the script's output as input
  assert.match(summariser, /add the dates/); // the reviewer's feedback
  const reviewer = session("03-reviewer");
  assert.match(reviewer, /You review summaries\./); // the reviewer's instructions, from prompts/reviewer.md
  assert.match(reviewer, /draft 1/);
  assert.ok(reviewer.includes(`step 1 (script fetch): ${join(run.runDir, "steps", "01-fetch.md")}`)); // the reviewed step's own input, by path
  assert.match(reviewer, /task_review_verdict/);
  assert.match(reviewer, /draft 2/);
  assert.match(run.log, /## Step 3: agent reviewer reviews step 2 \(agent\)/);
});

test("out of review rounds, the run carries on with the latest version and says so", async () => {
  process.env.ALWAYS_REVISE = "1";
  try {
    writeFileSync(join(home, "tasks", "strict.yaml"), digest().replace("reviews: 2\n", "reviews: 2\n    maxRounds: 2\n"));
    const run = await finished(startTaskRun("strict").runId);
    assert.equal(run.status, "completed", run.log);
    assert.equal(listRunSteps(run.id)[2].note, "not approved after 2 round(s)");
    assert.equal(readFileSync(join(run.runDir, "steps", "03-reviewer.md"), "utf8"), "draft 2");
  } finally {
    delete process.env.ALWAYS_REVISE;
  }
});

test("a failing script fails the run and skips the steps after it, without starting any agent", async () => {
  writeFileSync(join(home, "tasks", "broken.yaml"), digest());
  process.env.FAIL = "1";
  try {
    const run = await finished(startTaskRun("broken").runId);
    assert.equal(run.status, "failed");
    assert.equal(run.errorMessage, "script fetch exited with code 3");
    assert.deepEqual(listRunSteps(run.id).map((s) => s.status), ["failed", "skipped", "skipped", "skipped"]);
    assert.ok(!existsSync(join(run.runDir, "sessions", "02-agent")));
  } finally {
    delete process.env.FAIL;
  }
});

test("an invalid task file is refused with every problem listed", () => {
  writeFileSync(
    join(home, "tasks", "bad.yaml"),
    `schedule: "every day"
steps:
  - script: fetch
  - script: unknown
  - agent: {}
    instructions: hi
  - agent: { model: fake/model }
    instructionsFile: nope.md
    reviews: 1
    timeout: soon
`,
  );
  const { errors } = loadTask("bad");
  for (const expected of [
    'schedule "every day" isn\'t a 5-field cron expression',
    "step 1: script fetch needs param query",
    "step 2: script unknown has no scripts/unknown/config.yaml",
    "step 3: agent needs a model (pi's provider/id)",
    "step 4: prompts/nope.md not found",
    "step 4: timeout must look like 90s, 30m or 2h",
    "step 4: reviews must be the number of an earlier agent step",
  ])
    assert.ok(errors.includes(expected), `missing "${expected}" in:\n${errors.join("\n")}`);
  assert.throws(() => startTaskRun("bad"), /tasks\/bad\.yaml has errors/);
});

test("herdr agent names fit herdr's rule and stay unique per run and agent, however long or odd the agent's name", () => {
  const names = ["summariser", "a-very-long-agent-name-that-goes-on-and-on", "a-very-long-agent-name-that-goes-on-and-on-too", "Reviewer 2!"].map((n, i) => herdrAgentName("0123456789abcdef", i, n));
  for (const n of names) assert.match(n, HERDR_AGENT_NAME, n);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names[0], "joey-01234567-0-summariser");
  assert.notEqual(herdrAgentName("aaaaaaaa11", 0, "x"), herdrAgentName("bbbbbbbb11", 0, "x"));
});
