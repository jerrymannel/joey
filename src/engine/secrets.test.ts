import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnvFile, loadSecretsEnv, SecretsFileMissingError } from "./secrets.ts";

test("parseEnvFile handles quotes, comments, and blank lines", () => {
  const text = `
# comment
FOO=bar
QUOTED="hello world"
SINGLE='single value'
BLANK_IGNORED
EMPTY=
`;
  assert.deepEqual(parseEnvFile(text), {
    FOO: "bar",
    QUOTED: "hello world",
    SINGLE: "single value",
    EMPTY: "",
  });
});

test("loadSecretsEnv returns {} for null path and throws for a missing file", async () => {
  assert.deepEqual(await loadSecretsEnv(null), {});
  await assert.rejects(() => loadSecretsEnv("/no/such/path.env"), SecretsFileMissingError);

  const dir = mkdtempSync(join(tmpdir(), "herdr-secrets-"));
  const path = join(dir, "task.env");
  writeFileSync(path, "KEY=value\n");
  assert.deepEqual(await loadSecretsEnv(path), { KEY: "value" });
  rmSync(dir, { recursive: true, force: true });
});
