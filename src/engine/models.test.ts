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

test("createModel/updateModel/deleteModel round-trip", async () => {
  const { mod, dir } = await freshModels();

  const model = mod.createModel({ name: "Sonnet", value: "claude-sonnet-5" });
  assert.deepEqual(mod.listModels().map((m: any) => m.id), [model.id]);
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
  assert.deepEqual(mod.listModels(), []);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
