import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "joey-models-"));
process.env.JOEY_HOME = home;
const piModels = join(home, "pi-models.json");
process.env.JOEY_PI_MODELS_PATH = piModels;

writeFileSync(
  join(home, "models.yaml"),
  `models:
  - claude-bridge/claude-sonnet-5
  - name: gemma-local
    endpoint: http://127.0.0.1:8080/v1
  - { bogus: true }
`,
);

const { loadModels } = await import("./definitions.ts");
const { resolvePiModel, ensureLocalModels } = await import("./agent-session.ts");

test("loadModels keeps string and {name,endpoint} entries, drops malformed ones", () => {
  assert.deepEqual(loadModels(), [
    { name: "claude-bridge/claude-sonnet-5" },
    { name: "gemma-local", endpoint: "http://127.0.0.1:8080/v1" },
  ]);
});

test("resolvePiModel maps a local model to its joey provider/id and leaves a plain provider/id alone", () => {
  assert.equal(resolvePiModel("gemma-local"), "joey-gemma-local/gemma-local");
  assert.equal(resolvePiModel("claude-bridge/claude-sonnet-5"), "claude-bridge/claude-sonnet-5");
});

test("ensureLocalModels registers only local models as openai-compatible providers, preserving the user's own", () => {
  writeFileSync(piModels, JSON.stringify({ providers: { mine: { keep: true } } }));
  ensureLocalModels();
  const cfg = JSON.parse(readFileSync(piModels, "utf8"));
  assert.deepEqual(cfg.providers.mine, { keep: true });
  assert.equal(cfg.providers["joey-gemma-local"].baseUrl, "http://127.0.0.1:8080/v1");
  assert.equal(cfg.providers["joey-gemma-local"].api, "openai-completions");
  assert.deepEqual(cfg.providers["joey-gemma-local"].models, [{ id: "gemma-local", name: "gemma-local" }]);
});
