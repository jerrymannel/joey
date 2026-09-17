import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("getDataDb/getLogsDb create tables idempotently", async () => {
  const dir = mkdtempSync(join(tmpdir(), "joey-db-test-"));
  process.env.DATA_DB_PATH = join(dir, "data.db");
  process.env.LOGS_DB_PATH = join(dir, "logs.db");

  const { getDataDb, getLogsDb } = await import(`./db.ts?t=${Date.now()}`);

  const dataDb = getDataDb();
  const tableNames = dataDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: any) => r.name);
  assert.deepEqual(tableNames.sort(), ["settings", "tasks"]);

  const logsDb = getLogsDb();
  const logTableNames = logsDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: any) => r.name);
  assert.deepEqual(logTableNames.sort(), ["runs"]);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
