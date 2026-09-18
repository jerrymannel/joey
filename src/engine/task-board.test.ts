import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveWorkspaceFolder } from "./settings.ts";

// saveWorkspaceFolder encrypts at rest — give it a key so tests don't need real settings config.
process.env.SETTINGS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");

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

test("createTask throws for gmail/youtube automations until a workspace folder is configured", async () => {
  const { mod, dir } = await freshTaskBoard();
  assert.throws(() => mod.createTask({ name: "no workspace yet", service: "gmail" }), /Set a workspace folder/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("createTask defaults to the generic service; listTasks filters by service; toolIds round-trip", async () => {
  const { mod, dir } = await freshTaskBoard();

  const generic = mod.createTask({ name: "generic task", folderPath: "/tmp/c" });
  assert.equal(generic.service, "generic");
  assert.deepEqual(generic.toolIds, []);

  saveWorkspaceFolder(dir);
  const gmailAuto = mod.createTask({
    name: "gmail automation",
    service: "gmail",
    toolIds: ["tool-1"],
    searchQuery: "is:unread from:boss@example.com",
  });
  assert.equal(gmailAuto.service, "gmail");
  assert.deepEqual(gmailAuto.toolIds, ["tool-1"]);
  assert.equal(gmailAuto.searchQuery, "is:unread from:boss@example.com");
  assert.equal(gmailAuto.id.includes("-"), false);
  assert.equal(gmailAuto.folderPath, join(dir, gmailAuto.id));

  // Other tests in this file share the same underlying db connection (db.ts caches its handle at
  // module scope, unaffected by these tests' cache-busted task-board.ts imports), so assert
  // membership rather than exact list contents.
  const gmailTasks = mod.listTasks("gmail");
  assert.ok(gmailTasks.every((t: any) => t.service === "gmail"));
  assert.ok(gmailTasks.some((t: any) => t.id === gmailAuto.id));
  assert.deepEqual(mod.listTasks("youtube"), []);
  const allIds = mod.listTasks().map((t: any) => t.id);
  assert.ok(allIds.includes(generic.id));
  assert.ok(allIds.includes(gmailAuto.id));

  const updated = mod.updateTask(gmailAuto.id, { toolIds: ["tool-1", "tool-2"], searchQuery: "is:starred" });
  assert.deepEqual(updated.toolIds, ["tool-1", "tool-2"]);
  assert.equal(updated.searchQuery, "is:starred");

  const genericNoQuery = mod.createTask({ name: "no query", folderPath: "/tmp/no-query" });
  assert.equal(genericNoQuery.searchQuery, "");

  const youtubeAuto = mod.createTask({ name: "youtube automation", service: "youtube", playlistId: "PL123" });
  assert.equal(youtubeAuto.playlistId, "PL123");
  const updatedPlaylist = mod.updateTask(youtubeAuto.id, { playlistId: "PL456" });
  assert.equal(updatedPlaylist.playlistId, "PL456");

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("updateTask allows moving a task's own folderPath but rejects clashing with another task's", async () => {
  const { mod, dir } = await freshTaskBoard();
  const taskA = mod.createTask({ name: "a", folderPath: "/tmp/movable-a" });
  const taskB = mod.createTask({ name: "b", folderPath: "/tmp/movable-b" });

  const renamed = mod.updateTask(taskA.id, { folderPath: "/tmp/movable-a-renamed" });
  assert.equal(renamed.folderPath, "/tmp/movable-a-renamed");

  assert.throws(
    () => mod.updateTask(taskB.id, { folderPath: "/tmp/movable-a-renamed" }),
    /a task for this folder already exists/,
  );

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
