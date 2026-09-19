import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function freshTools() {
  const dir = mkdtempSync(join(tmpdir(), "joey-tools-test-"));
  process.env.DATA_DB_PATH = join(dir, "data.db");
  process.env.LOGS_DB_PATH = join(dir, "logs.db");
  const mod = await import(`./tools.ts?t=${Date.now()}-${Math.random()}`);
  const db = await import("./db.ts") // the same instance tools.ts uses;
  return { mod, db, dir };
}

test("listTools lists the catalog, including the mailbox tools, and filters by service", async () => {
  const { mod, dir } = await freshTools();

  const all = mod.listTools();
  assert.ok(all.some((t: any) => t.service === "mailbox" && t.name === "Send result"));
  assert.ok(all.every((t: any) => ["gmail", "youtube", "mailbox"].includes(t.service)));
  assert.ok(mod.listTools("gmail").every((t: any) => t.service === "gmail"));

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("a catalog entry missing from an existing database is added on the next listing, without duplicating the rest", async () => {
  const { mod, db, dir } = await freshTools();
  const before = mod.listTools().length;
  db.getDataDb().prepare("DELETE FROM tools WHERE name = 'Send result'").run();
  db.getDataDb().prepare("UPDATE tools SET description = 'edited' WHERE name = 'Send message'").run();

  const after = mod.listTools();
  assert.equal(after.length, before);
  assert.ok(after.some((t: any) => t.name === "Send result"));
  assert.equal(after.find((t: any) => t.name === "Send message").description, "edited"); // existing rows untouched

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
