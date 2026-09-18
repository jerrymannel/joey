import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function freshModels() {
  const dir = mkdtempSync(join(tmpdir(), "joey-models-test-"));
  process.env.DATA_DB_PATH = join(dir, "data.db");
  process.env.LOGS_DB_PATH = join(dir, "logs.db");
  const mod = await import(`./models.ts?t=${Date.now()}-${Math.random()}`);
  return { mod, dir };
}

test("listModels seeds pi's default provider/id catalog once", async () => {
  const { mod, dir } = await freshModels();

  const all = mod.listModels();
  assert.ok(all.length > 0);
  assert.ok(all.every((m: any) => m.value.includes("/") && m.endpoint === ""));

  assert.ok(all.every((m: any) => m.isDefault && m.enabled));

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("createModel/updateModel/deleteModel round-trip", async () => {
  const { mod, dir } = await freshModels();
  const seededCount = mod.listModels().length;

  const model = mod.createModel({ name: "Sonnet", value: "claude-sonnet-5" });
  assert.ok(mod.listModels().some((m: any) => m.id === model.id));
  assert.equal(model.endpoint, "");

  const updated = mod.updateModel(model.id, { name: "Sonnet 5" });
  assert.equal(updated.name, "Sonnet 5");
  assert.equal(updated.value, "claude-sonnet-5");

  const custom = mod.createModel({ name: "Local vLLM", value: "llama-3", endpoint: "http://localhost:8000/v1" });
  assert.equal(custom.endpoint, "http://localhost:8000/v1");
  const updatedEndpoint = mod.updateModel(custom.id, { endpoint: "http://localhost:9000/v1" });
  assert.equal(updatedEndpoint.endpoint, "http://localhost:9000/v1");

  mod.deleteModel(model.id);
  mod.deleteModel(custom.id);
  assert.equal(mod.listModels().length, seededCount);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("default models can be disabled but not edited or deleted", async () => {
  const { mod, dir } = await freshModels();
  const [first] = mod.listModels();

  assert.throws(() => mod.deleteModel(first.id), /can't be deleted/);
  assert.ok(mod.getModel(first.id));

  const patched = mod.updateModel(first.id, { name: "Renamed", value: "x/y", enabled: false });
  assert.equal(patched.enabled, false);
  assert.equal(patched.name, first.name);
  assert.equal(patched.value, first.value);

  assert.equal(mod.updateModel(first.id, { enabled: true }).enabled, true);

  const custom = mod.createModel({ name: "Mine", value: "mine" });
  assert.equal(custom.isDefault, false);
  assert.equal(mod.updateModel(custom.id, { enabled: false }).enabled, false);
  assert.equal(mod.updateModel(custom.id, { name: "Mine 2" }).enabled, false); // patch without `enabled` keeps it
  mod.deleteModel(custom.id);
  assert.equal(mod.getModel(custom.id), undefined);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
