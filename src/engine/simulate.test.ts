import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "joey-simulate-test-"));
const home = join(dir, "home");
process.env.JOEY_HOME = home;
process.env.DATA_DB_PATH = join(dir, "data.db");
process.env.SETTINGS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");

mkdirSync(join(home, "tasks"), { recursive: true });
mkdirSync(join(home, "prompts"), { recursive: true });
mkdirSync(join(home, "scripts", "fetch"), { recursive: true });
writeFileSync(join(home, "prompts", "summariser.md"), "You summarise email.");
writeFileSync(join(home, "prompts", "final.md"), "Send the final digest with task_send_result.");
writeFileSync(join(home, "scripts", "fetch", "app.ts"), "// noop\n");
writeFileSync(join(home, "scripts", "fetch", "config.yaml"), "params:\n  query: { required: true }\n");

const { loadTask } = await import("./definitions.ts");
const { simulateTask } = await import("./simulate.ts");

const taskYaml = `name: Digest
steps:
  - script: fetch
    params: { query: "is:unread" }
  - agent: { model: fake/model, thinking: high }
    instructions: Summarise the emails above.
  - agent: { model: fake/model }
    instructionsFile: final.md
`;

test("instructionsFile validates like a prompt and can't be paired with inline instructions", () => {
  writeFileSync(join(home, "tasks", "ok.yaml"), taskYaml);
  assert.deepEqual(loadTask("ok").errors, []);

  writeFileSync(join(home, "tasks", "both.yaml"), `name: X
steps:
  - agent: { model: m }
    instructions: hi
    instructionsFile: final.md
`);
  assert.ok(loadTask("both").errors.some((e) => /exactly one of instructions or instructionsFile/.test(e)));

  writeFileSync(join(home, "tasks", "missing.yaml"), `name: X
steps:
  - agent: { model: m }
    instructionsFile: nope.md
`);
  assert.ok(loadTask("missing").errors.some((e) => /prompts\/nope\.md not found/.test(e)));
});

test("simulate shows the herdr + pi commands each step would run, without running anything", () => {
  writeFileSync(join(home, "tasks", "ok.yaml"), taskYaml);
  const sim = simulateTask("ok");

  // 3 steps + a teardown that closes both agent steps' tabs.
  assert.equal(sim.steps.length, 4);
  assert.equal(sim.steps[3].label, "Teardown");
  assert.equal(sim.steps[3].commands.length, 2);

  const script = sim.steps[0].commands.join("\n");
  assert.match(script, /herdr tab create --cwd .* --label 'joey:ok:fetch'/);
  assert.match(script, /JOEY_PARAMS=\{"query":"is:unread"\}/);
  assert.match(script, /tsx.*scripts\/fetch\/app\.ts/);

  // First agent step (inline instructions, id "agent"): tab, exported env, pi launch (model + thinking + extension), then the instructions — no separate briefing.
  const first = sim.steps[1].commands.join("\n");
  assert.match(first, /herdr agent start joey-.* --kind pi --pane <pane:02-agent> --timeout 60000 -- .*--model.*fake\/model.*--thinking.*high/);
  assert.match(first, /Summarise the emails above\./);

  // Second agent step: its own pi session, id from its instructionsFile ("final"), instructions read from prompts/final.md.
  const second = sim.steps[2].commands.join("\n");
  assert.match(second, /herdr agent start joey-.* --kind pi --pane <pane:03-final>/);
  assert.match(second, /Send the final digest with task_send_result\./);
});
