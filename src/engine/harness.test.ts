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
    promptId: "",
    prompt: "do the thing",
    harness: "pi",
    cliParams: "",
    model: "",
    schedule: null,
    service: "gmail",
    toolIds: [],
    searchQuery: "",
    playlistId: "",
    account: "",
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
  assert.match(command, /"do the thing/); // pi appends the mailbox instruction
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

test("mailbox tools are always on: never listed under \"Available tools\" (the mailbox block covers them), even if a task stored one", async () => {
  const { harness, tools, dir } = await freshHarness();
  const mailboxTool = tools.listTools("mailbox")[0];
  const command = harness.describeCommand(baseTask({ toolIds: [mailboxTool.id] }));
  assert.doesNotMatch(command, /Available tools/);
  assert.match(command, /mailbox_send_result/);

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
  assert.match(full, /'do the thing/);
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

test("a pi run's prompt ends with the mailbox tools instruction and its command carries RUN_ID/TASK_ID/RESULTS_DIR (MAIL_HOPS only once mail was delivered) but no tee; other harnesses get neither", async () => {
  const { harness, tools, dir } = await freshHarness();

  const pi = harness.describeRun(baseTask({ harness: "pi" })).commands.join("\n");
  // every mailbox tool in the catalog is named in the instruction, has its own pi-tools file, and is registered by index.ts
  const mailboxTools = tools.listTools("mailbox").map((t: { name: string }) => t.name);
  assert.equal(mailboxTools.length, 5);
  const index = readFileSync("pi-tools/index.ts", "utf8");
  for (const tool of mailboxTools) {
    assert.match(pi, new RegExp(tool));
    assert.match(index, new RegExp(`"\\./${tool}\\.ts"`));
    assert.match(readFileSync(`pi-tools/${tool}.ts`, "utf8"), new RegExp(`name: "${tool}"`));
  }
  assert.match(pi, /not the Gmail tools \(gmail_search_emails, gmail_read_email\)/);
  assert.match(pi, /Answering in chat without calling it means the task failed/);
  assert.match(pi, /RUN_ID='<run-id>'/);
  assert.match(pi, /TASK_ID='t1'/);
  assert.match(pi, /RESULTS_DIR=/);
  assert.doesNotMatch(pi, /MAIL_HOPS/);
  assert.doesNotMatch(pi, /tee/);
  assert.doesNotMatch(harness.describeCommand(baseTask({ harness: "claude" })), /mailbox_/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
