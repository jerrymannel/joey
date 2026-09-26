import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeHerdr } from "../test-support/fake-herdr.ts";

const dir = mkdtempSync(join(tmpdir(), "joey-subagent-test-"));
const home = join(dir, "home");
process.env.JOEY_HOME = home;
process.env.JOEY_PI_MODELS_PATH = join(dir, "pi-models.json"); // keep ensureLocalModels off the real ~/.pi
mkdirSync(home, { recursive: true });
installFakeHerdr(dir);

const fakeAgent = join(dir, "fake-agent.cjs");
writeFileSync(
  fakeAgent,
  `const fs = require("node:fs");
const [name, text, sessionDir] = process.argv.slice(2);
const file = sessionDir + "/session.jsonl";
const line = (m) => JSON.stringify({ type: "message", message: m }) + "\\n";
fs.appendFileSync(file, line({ role: "user", content: [{ type: "text", text }] }) + line({ role: "assistant", content: [{ type: "text", text: "sub done: " + text }], stopReason: "stop" }));
`,
);
process.env.JOEY_FAKE_AGENT = fakeAgent;

const { runSubAgent } = await import("./agent-session.ts");

test("runSubAgent opens a one-shot session, sends the instructions and returns the reply", async () => {
  const runDir = join(dir, "run");
  mkdirSync(runDir, { recursive: true });
  const { reply } = await runSubAgent({
    model: "fake/model",
    instructions: "summarise these notes",
    label: "Researcher #1",
    cwd: dir,
    runDir,
    env: { RUN_DIR: runDir, TASK_ID: "t" },
    timeoutMs: 60_000,
  });
  assert.equal(reply, "sub done: summarise these notes");
});
