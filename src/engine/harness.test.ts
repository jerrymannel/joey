import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task } from "./task-board.ts";

async function freshHarness() {
  const dir = mkdtempSync(join(tmpdir(), "joey-harness-test-"));
  process.env.DATA_DB_PATH = join(dir, "data.db");
  process.env.LOGS_DB_PATH = join(dir, "logs.db");
  const harness = await import(`./harness.ts?t=${Date.now()}-${Math.random()}`);
  const tools = await import(`./tools.ts?t=${Date.now()}-${Math.random()}`);
  return { harness, tools, dir };
}

function baseTask(overrides: Partial<Task>): Task {
  return {
    id: "t1",
    name: "task",
    folderPath: "/tmp",
    prompt: "do the thing",
    harness: "pi",
    cliParams: "",
    model: "",
    schedule: null,
    service: "gmail",
    toolIds: [],
    searchQuery: "",
    playlistId: "",
    thinkingLevel: "",
    trustFolder: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

test("describeCommand passes the prompt through unchanged with no tools enabled", async () => {
  const { harness, dir } = await freshHarness();
  const command = harness.describeCommand(baseTask({}));
  assert.match(command, /"do the thing"/);
  assert.doesNotMatch(command, /Available tools/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("describeCommand prepends enabled tools' names/descriptions to the prompt", async () => {
  const { harness, tools, dir } = await freshHarness();
  const gmailTool = tools.listTools("gmail")[0];
  const command = harness.describeCommand(baseTask({ toolIds: [gmailTool.id] }));
  assert.match(command, /Available tools:/);
  assert.ok(command.includes(gmailTool.name));

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("describeCommand adds --thinking and --approve for pi only", async () => {
  const { harness, dir } = await freshHarness();

  const piCommand = harness.describeCommand(baseTask({ harness: "pi", thinkingLevel: "high", trustFolder: true }));
  assert.match(piCommand, /--thinking high/);
  assert.match(piCommand, /--approve/);

  const claudeCommand = harness.describeCommand(
    baseTask({ harness: "claude", thinkingLevel: "high", trustFolder: true }),
  );
  assert.doesNotMatch(claudeCommand, /--thinking/);
  assert.doesNotMatch(claudeCommand, /--approve/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("describeRun previews the full herdr tab create/run/close sequence for pi, not just the pi command", async () => {
  const { harness, dir } = await freshHarness();

  const { cwd, commands } = harness.describeRun(baseTask({ harness: "pi" }));
  const full = commands.join("\n");
  assert.equal(cwd, "/tmp");
  assert.match(full, /herdr tab create --cwd \/tmp/);
  assert.match(full, /herdr pane run <pane-id>/);
  assert.match(full, /'do the thing'/);
  assert.match(full, /herdr pane wait-output <pane-id>/);
  assert.match(full, /herdr tab close <tab-id>/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("describeRun previews a single direct command for non-pi harnesses", async () => {
  const { harness, dir } = await freshHarness();

  const { cwd, commands } = harness.describeRun(baseTask({ harness: "claude" }));
  assert.equal(cwd, "/tmp");
  assert.deepEqual(commands, [harness.describeCommand(baseTask({ harness: "claude" }))]);
  assert.ok(!commands.some((line: string) => line.includes("herdr")));

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("a pi run of a custom-endpoint model passes provider/id and registers the provider in pi's models.json, keeping other providers", async () => {
  const { harness, dir } = await freshHarness();
  const home = mkdtempSync(join(tmpdir(), "joey-home-"));
  process.env.HOME = home;
  const models = await import(`./models.ts?t=${Date.now()}-${Math.random()}`);
  const piHerdr = await import(`./pi-herdr.ts?t=${Date.now()}-${Math.random()}`);
  const custom = models.createModel({ name: "Gemma", value: "gemma-26B", endpoint: "http://127.0.0.1:8080/v1" });

  const modelArg = (task: Task) => {
    const a: string[] = harness.buildArgs(task);
    return a[a.indexOf("--model") + 1];
  };
  assert.equal(modelArg(baseTask({ harness: "pi", model: "gemma-26B" })), `joey-${custom.id}/gemma-26B`);
  // standard models and non-pi harnesses keep the raw value
  assert.equal(modelArg(baseTask({ harness: "pi", model: "claude-sonnet-5" })), "claude-sonnet-5");
  assert.equal(modelArg(baseTask({ harness: "claude", model: "gemma-26B" })), "gemma-26B");

  const file = join(home, ".pi/agent/models.json");
  mkdirSync(join(home, ".pi/agent"), { recursive: true });
  writeFileSync(file, JSON.stringify({ providers: { mine: { baseUrl: "x" }, "joey-stale": {} } }));
  piHerdr.syncPiCustomModels();
  const { providers } = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(providers.mine, { baseUrl: "x" });
  assert.equal(providers["joey-stale"], undefined);
  assert.equal(providers[`joey-${custom.id}`].baseUrl, "http://127.0.0.1:8080/v1");
  assert.equal(providers[`joey-${custom.id}`].api, "openai-completions");
  assert.deepEqual(providers[`joey-${custom.id}`].models.map((m: any) => m.id), ["gemma-26B"]);

  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
