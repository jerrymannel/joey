import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("getDataDb/getSettingsDb/getLogsDb create their own tables idempotently", async () => {
  const dir = mkdtempSync(join(tmpdir(), "joey-db-test-"));
  process.env.DATA_DB_PATH = join(dir, "data.db");
  process.env.LOGS_DB_PATH = join(dir, "logs.db");

  const { getDataDb, getSettingsDb, getLogsDb } = await import(`./db.ts?t=${Date.now()}`);

  const dataDb = getDataDb();
  const tableNames = dataDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: any) => r.name);
  assert.deepEqual(tableNames.sort(), ["task_state", "tasks"]);

  const settingsNames = getSettingsDb()
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: any) => r.name);
  assert.deepEqual(settingsNames.sort(), ["models", "prompts", "settings", "ssh_configs", "tools"]);
  assert.ok(existsSync(join(dir, "settings.db"))); // beside data.db unless SETTINGS_DB_PATH says otherwise

  const logsDb = getLogsDb();
  const logTableNames = logsDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: any) => r.name);
  assert.deepEqual(logTableNames.sort(), ["run_steps", "runs", "task_runs", "youtube_runs"]);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("a data.db from when tasks.folder_path was UNIQUE is rebuilt without it, keeping its rows", async () => {
  const { default: Database } = await import("better-sqlite3");
  const dir = mkdtempSync(join(tmpdir(), "joey-db-test-"));
  const path = join(dir, "data.db");
  process.env.DATA_DB_PATH = path;
  process.env.LOGS_DB_PATH = join(dir, "logs.db");
  const legacy = new Database(path);
  legacy.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, folder_path TEXT NOT NULL UNIQUE, prompt TEXT NOT NULL DEFAULT '', harness TEXT NOT NULL DEFAULT 'pi', cli_params TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', schedule TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO tasks (id, name, folder_path, prompt, created_at, updated_at) VALUES ('a', 'old', '/x', 'hi', 't', 't');`);
  legacy.close();

  const { getDataDb } = await import(`./db.ts?t=${Date.now()}-${Math.random()}`);
  const db = getDataDb();
  const row = db.prepare("SELECT name, prompt, service, extensions FROM tasks WHERE id = 'a'").get();
  assert.deepEqual(row, { name: "old", prompt: "hi", service: "generic", extensions: "" });
  db.prepare("INSERT INTO tasks (id, name, folder_path, created_at, updated_at) VALUES ('b', 'same folder', '/x', 't', 't')").run(); // no longer UNIQUE
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'tasks_old'").get().n, 0);

  db.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("settings, models, prompts, ssh_configs and tools from an old data.db move into settings.db once, with their ids and columns, leaving the tasks", async () => {
  const { default: Database } = await import("better-sqlite3");
  const dir = mkdtempSync(join(tmpdir(), "joey-db-test-"));
  process.env.DATA_DB_PATH = join(dir, "data.db");
  const legacy = new Database(join(dir, "data.db"));
  legacy.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, folder_path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO tasks VALUES ('t', 'task', '/x', 'c', 'u');
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO settings VALUES ('workspace_folder', 'enc:secret', 'u');
    CREATE TABLE models (id TEXT PRIMARY KEY, name TEXT NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO models VALUES ('m', 'Old', 'old-model', 'c');
    CREATE TABLE tools (id TEXT PRIMARY KEY, service TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    INSERT INTO tools VALUES ('tool-id', 'ssh', 'ssh_run_command', 'd', 'c');`);
  legacy.close();

  const { getDataDb, getSettingsDb } = await import(`./db.ts?t=${Date.now()}-${Math.random()}`);
  const settings = getSettingsDb();
  assert.deepEqual(settings.prepare("SELECT key, value FROM settings").all(), [{ key: "workspace_folder", value: "enc:secret" }]);
  assert.deepEqual(settings.prepare("SELECT id, name, value, endpoint, enabled FROM models").all(), [{ id: "m", name: "Old", value: "old-model", endpoint: "", enabled: 1 }]);
  assert.equal((settings.prepare("SELECT id FROM tools WHERE name = 'ssh_run_command'").get() as { id: string }).id, "tool-id");

  const data = getDataDb();
  assert.deepEqual((data.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name).sort(), ["task_state", "tasks"]);
  assert.equal((data.prepare("SELECT name FROM tasks").get() as { name: string }).name, "task");

  settings.close();
  data.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
});
