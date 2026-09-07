import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function freshTaskBoard() {
  const dir = mkdtempSync(join(tmpdir(), "herdr-task-board-test-"));
  process.env.DATA_DB_PATH = join(dir, "data.db");
  process.env.LOGS_DB_PATH = join(dir, "logs.db");
  const mod = await import(`./task-board.ts?t=${Date.now()}-${Math.random()}`);
  return { mod, dir };
}

test("non-git tasks default to max_parallel_workers=1 at creation, not just on first save", async () => {
  const { mod, dir } = await freshTaskBoard();
  const gitTask = mod.createTask({ name: "git-task", folderPath: "/tmp/a", isGitRepo: true });
  assert.equal(gitTask.maxParallelWorkers, 3);

  const nonGitTask = mod.createTask({ name: "non-git-task", folderPath: "/tmp/b", isGitRepo: false });
  assert.equal(nonGitTask.maxParallelWorkers, 1);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("updateTask clamps max_parallel_workers to 1 whenever isGitRepo flips to false, regardless of caller", async () => {
  const { mod, dir } = await freshTaskBoard();
  const task = mod.createTask({ name: "flip-task", folderPath: "/tmp/c", isGitRepo: true });
  mod.updateTask(task.id, { maxParallelWorkers: 5 });

  // Simulates the GET route's isGitRepo re-check, which only patches isGitRepo — not maxParallelWorkers.
  const flipped = mod.updateTask(task.id, { isGitRepo: false });
  assert.equal(flipped.maxParallelWorkers, 1);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
