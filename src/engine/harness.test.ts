import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
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

test("describeCommand adds --thinking-level and --dangerously-skip-permissions for pi only", async () => {
  const { harness, dir } = await freshHarness();

  const piCommand = harness.describeCommand(baseTask({ harness: "pi", thinkingLevel: "high", trustFolder: true }));
  assert.match(piCommand, /--thinking-level high/);
  assert.match(piCommand, /--dangerously-skip-permissions/);

  const claudeCommand = harness.describeCommand(
    baseTask({ harness: "claude", thinkingLevel: "high", trustFolder: true }),
  );
  assert.doesNotMatch(claudeCommand, /--thinking-level/);
  assert.doesNotMatch(claudeCommand, /--dangerously-skip-permissions/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
