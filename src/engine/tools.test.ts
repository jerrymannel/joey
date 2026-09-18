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
  return { mod, dir };
}

test("listTools seeds the default catalog once, and filters by service", async () => {
  const { mod, dir } = await freshTools();

  const all = mod.listTools();
  assert.ok(all.length > 0);
  assert.ok(all.every((t: any) => t.service === "gmail" || t.service === "youtube"));

  const gmailOnly = mod.listTools("gmail");
  assert.ok(gmailOnly.length > 0);
  assert.ok(gmailOnly.every((t: any) => t.service === "gmail"));

  // Deleting one and re-listing must not re-seed (seeding only fires when the table is empty).
  mod.deleteTool(all[0].id);
  assert.equal(mod.listTools().length, all.length - 1);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("createTool/updateTool round-trip", async () => {
  const { mod, dir } = await freshTools();
  const tool = mod.createTool({ service: "gmail", name: "Custom", description: "desc" });
  const updated = mod.updateTool(tool.id, { description: "new desc" });
  assert.equal(updated.name, "Custom");
  assert.equal(updated.description, "new desc");

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
