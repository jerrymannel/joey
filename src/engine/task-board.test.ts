import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function freshTaskBoard() {
  const dir = mkdtempSync(join(tmpdir(), "joey-task-board-test-"));
  process.env.DATA_DB_PATH = join(dir, "data.db");
  process.env.LOGS_DB_PATH = join(dir, "logs.db");
  const mod = await import(`./task-board.ts?t=${Date.now()}-${Math.random()}`);
  return { mod, dir };
}

test("createTask defaults to the pi harness with no prompt/model/schedule", async () => {
  const { mod, dir } = await freshTaskBoard();
  const task = mod.createTask({ name: "a task", folderPath: "/tmp/a" });
  assert.equal(task.harness, "pi");
  assert.equal(task.prompt, "");
  assert.equal(task.model, "");
  assert.equal(task.schedule, null);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("updateTask rejects an unknown harness", async () => {
  const { mod, dir } = await freshTaskBoard();
  const task = mod.createTask({ name: "a task", folderPath: "/tmp/b" });
  assert.throws(() => mod.updateTask(task.id, { harness: "not-a-harness" }), /harness must be one of/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
