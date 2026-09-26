import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
agents:
  summariser: { prompt: summariser.md, model: fake/model, thinking: high }
steps:
  - script: fetch
    params: { query: "is:unread" }
  - agent: summariser
    instruction: Summarise the emails above.
  - agent: summariser
    instructionFile: final.md
`;

test("instructionFile validates like a prompt and can't be paired with inline instruction", () => {
  writeFileSync(join(home, "tasks", "ok.yaml"), taskYaml);
  assert.deepEqual(loadTask("ok").errors, []);

  writeFileSync(join(home, "tasks", "both.yaml"), `name: X
agents: { a: { prompt: summariser.md, model: m } }
steps:
  - agent: a
    instruction: hi
    instructionFile: final.md
`);
  assert.ok(loadTask("both").errors.some((e) => /exactly one of instruction or instructionFile/.test(e)));

  writeFileSync(join(home, "tasks", "missing.yaml"), `name: X
agents: { a: { prompt: summariser.md, model: m } }
steps:
  - agent: a
    instructionFile: nope.md
`);
  assert.ok(loadTask("missing").errors.some((e) => /prompts\/nope\.md not found/.test(e)));
});

test("simulate shows the herdr + pi commands each step would run, without running anything", () => {
  writeFileSync(join(home, "tasks", "ok.yaml"), taskYaml);
  const sim = simulateTask("ok");

  // 3 steps + a teardown that closes the one agent's tab.
  assert.equal(sim.steps.length, 4);
  assert.equal(sim.steps[3].label, "Teardown");

  const script = sim.steps[0].commands.join("\n");
  assert.match(script, /herdr tab create --cwd .* --label 'joey:ok:fetch'/);
  assert.match(script, /JOEY_PARAMS=\{"query":"is:unread"\}/);
  assert.match(script, /tsx.*scripts\/fetch\/app\.ts/);

  // First agent step: tab, exported env, pi launch (model + thinking + extension), then the prompt with its briefing.
  const first = sim.steps[1].commands.join("\n");
  assert.match(first, /herdr agent start joey-.* --kind pi --pane <pane:summariser> --timeout 60000 -- .*--model.*fake\/model.*--thinking.*high/);
  assert.match(first, /You summarise email\./); // briefed on first use
  assert.match(first, /Summarise the emails above\./);

  // Second use of the same agent: no new tab, and the instruction comes from prompts/final.md.
  const second = sim.steps[2].commands.join("\n");
  assert.ok(!/herdr agent start/.test(second), "no second launch for a reused agent");
  assert.match(second, /Send the final digest with task_send_result\./);
});
