import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeHerdr } from "../test-support/fake-herdr.ts";

const dir = mkdtempSync(join(tmpdir(), "joey-input-test-"));
const home = join(dir, "home");
process.env.DATA_DB_PATH = join(dir, "data.db");
process.env.JOEY_HOME = home;
process.env.SETTINGS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");
installFakeHerdr(dir);

// A fake agent that asks the user on its first turn (writes the question file the engine watches) and finishes once answered.
const fakeAgent = join(dir, "fake-agent.cjs");
writeFileSync(
  fakeAgent,
  `const fs = require("node:fs");
const [name, text, sessionDir] = process.argv.slice(2);
const file = sessionDir + "/session.jsonl";
const turns = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\\n").filter((l) => l.includes('"user"')).length : 0;
let reply;
if (turns === 0) {
  fs.writeFileSync(sessionDir + "/question.json", JSON.stringify({ agent: name, question: "Proceed?", options: ["yes", "no"] }));
  reply = "asked the user";
} else reply = "finished after: " + text;
const line = (m) => JSON.stringify({ type: "message", message: m }) + "\\n";
fs.appendFileSync(file, line({ role: "user", content: [{ type: "text", text }] }) + line({ role: "assistant", content: [{ type: "text", text: reply }], stopReason: "stop" }));
`,
);
process.env.JOEY_FAKE_AGENT = fakeAgent;

mkdirSync(join(home, "tasks"), { recursive: true });
mkdirSync(join(home, "prompts"), { recursive: true });
writeFileSync(join(home, "tasks", "ask.yaml"), `name: Ask\nsteps:\n  - agent: { model: fake/model }\n    instructions: Ask me whether to proceed.\n`);

const { saveWorkspaceFolder } = await import("./settings.ts");
const { startTaskRun } = await import("./task-run.ts");
const { getTaskRun } = await import("./task-runs.ts");
const { answerUser, pendingQuestion } = await import("./pending-input.ts");
saveWorkspaceFolder(join(dir, "ws"));

const wait = async (cond: () => boolean) => {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("condition never met");
};

test("agent_user_input parks the run until the user answers, then resumes the same agent with the answer", async () => {
  const { runId } = startTaskRun("ask");
  const runDir = getTaskRun(runId)!.runDir;

  // The run parks: the question surfaces and the run is still running.
  await wait(() => pendingQuestion(runDir) !== null);
  const q = pendingQuestion(runDir)!;
  assert.equal(q.question, "Proceed?");
  assert.deepEqual(q.options, ["yes", "no"]);
  assert.equal(getTaskRun(runId)!.status, "running");

  // Answering delivers to the parked run and clears the question.
  assert.equal(answerUser(runId, { choice: "yes", note: "go" }), true);

  await wait(() => getTaskRun(runId)!.status !== "running");
  const run = getTaskRun(runId)!;
  assert.equal(run.status, "completed", run.log);
  assert.equal(existsSync(join(runDir, "question.json")), false); // cleared once answered
  assert.match(run.log, /\[waiting for the user\] Proceed\?/);
  assert.match(run.log, /\[the user answered\] yes — go/);
  assert.match(run.log, /finished after: The user answered your question: yes/);
});

test("answerUser is a no-op when the run isn't waiting", () => {
  assert.equal(answerUser("no-such-run", { choice: "x" }), false);
});
