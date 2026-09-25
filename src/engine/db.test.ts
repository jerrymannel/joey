import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const tables = (db: Database.Database) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name).sort();

test("each database gets its own tables, and the tables of the old model are dropped while settings are kept", async () => {
  const dir = mkdtempSync(join(tmpdir(), "joey-db-test-"));
  process.env.DATA_DB_PATH = join(dir, "data.db");
  // Databases as the app left them before tasks were yaml files.
  const old = (file: string, sql: string) => {
    const db = new Database(join(dir, file));
    db.exec(sql);
    db.close();
  };
  old("data.db", "CREATE TABLE tasks (id TEXT)");
  old("settings.db", "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL); INSERT INTO settings VALUES ('k', 'v', ''); CREATE TABLE models (id TEXT); CREATE TABLE prompts (id TEXT); CREATE TABLE tools (id TEXT)");
  old("logs.db", "CREATE TABLE runs (id TEXT); CREATE TABLE youtube_runs (id TEXT)");

  try {
    const { getDataDb, getSettingsDb, getLogsDb } = await import(`./db.ts?t=${Date.now()}`);
    assert.deepEqual(tables(getDataDb()), ["task_state"]);
    assert.deepEqual(tables(getSettingsDb()), ["settings", "ssh_configs"]);
    assert.deepEqual(getSettingsDb().prepare("SELECT value FROM settings WHERE key = 'k'").get(), { value: "v" });
    assert.deepEqual(tables(getLogsDb()), ["run_steps", "task_runs"]);
    assert.ok(existsSync(join(dir, "settings.db")) && existsSync(join(dir, "logs.db"))); // beside data.db unless SETTINGS_DB_PATH / LOGS_DB_PATH say otherwise
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.DATA_DB_PATH;
  }
});
