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
  assert.ok(all.some((t: any) => t.service === "mailbox" && t.name === "mailbox_send_result" && t.alwaysOn));
  assert.ok(all.every((t: any) => ["gmail", "youtube", "mailbox", "ssh", "whisper", "task"].includes(t.service)));
  assert.ok(all.filter((t: any) => t.service === "mailbox").every((t: any) => t.name.startsWith("mailbox_")));
  assert.ok(all.filter((t: any) => t.service !== "mailbox" && t.service !== "task").every((t: any) => !t.alwaysOn));
  assert.ok(all.filter((t: any) => t.service === "task").every((t: any) => t.alwaysOn && t.name.startsWith("task_")));
  assert.ok(mod.listTools("gmail").every((t: any) => t.service === "gmail"));

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("a catalog entry missing from an existing database is added on the next listing, without duplicating the rest", async () => {
  const { mod, db, dir } = await freshTools();
  const before = mod.listTools().length;
  db.getSettingsDb().prepare("DELETE FROM tools WHERE name = 'mailbox_send_result'").run();
  db.getSettingsDb().prepare("UPDATE tools SET description = 'edited' WHERE name = 'mailbox_send_message'").run();

  const after = mod.listTools();
  assert.equal(after.length, before);
  assert.ok(after.some((t: any) => t.name === "mailbox_send_result"));
  assert.equal(after.find((t: any) => t.name === "mailbox_send_message").description, "edited"); // existing rows untouched

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("a mailbox tool row saved under its old display name is renamed in place, keeping its id", async () => {
  const { mod, db, dir } = await freshTools();
  mod.listTools();
  const id = (db.getSettingsDb().prepare("SELECT id FROM tools WHERE name = 'mailbox_send_message'").get() as { id: string }).id;
  db.getSettingsDb().prepare("UPDATE tools SET name = 'Send message' WHERE id = ?").run(id);

  const after = mod.listTools().filter((t: any) => t.service === "mailbox");
  assert.equal(after.length, 5);
  assert.equal(after.find((t: any) => t.id === id).name, "mailbox_send_message");

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
