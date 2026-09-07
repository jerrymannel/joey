import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validate, readDoneMarker, readArtifact } from "./artifact.ts";

test("validate checks required fields and types", () => {
  const schema = { required: ["verdict"], fields: { verdict: "string" as const, score: "number" as const } };
  assert.deepEqual(validate({ verdict: "pass", score: 1 }, schema), { ok: true });
  assert.equal(validate({ score: 1 }, schema).ok, false);
  assert.equal(validate({ verdict: 5 }, schema).ok, false);
  assert.equal(validate("nope", schema).ok, false);
});

test("readDoneMarker reads a valid marker and rejects malformed ones", async () => {
  const dir = mkdtempSync(join(tmpdir(), "herdr-artifact-"));
  mkdirSync(join(dir, ".orchestrator"));
  writeFileSync(join(dir, ".orchestrator", "done.json"), JSON.stringify({ success: true, message: "ok" }));
  assert.deepEqual(await readDoneMarker(dir), { success: true, message: "ok" });

  const missingDir = mkdtempSync(join(tmpdir(), "herdr-artifact-missing-"));
  assert.equal(await readDoneMarker(missingDir), undefined);

  rmSync(dir, { recursive: true, force: true });
  rmSync(missingDir, { recursive: true, force: true });
});

test("readArtifact validates JSON artifacts against a schema and passes through freeform ones", async () => {
  const dir = mkdtempSync(join(tmpdir(), "herdr-artifact-content-"));
  writeFileSync(join(dir, "report.md"), "# Report\nlooks good");
  const freeform = await readArtifact(dir, "report.md", null);
  assert.equal(freeform?.content.includes("Report"), true);

  writeFileSync(join(dir, "verdict.json"), JSON.stringify({ verdict: "pass", notes: "fine" }));
  const schema = { required: ["verdict", "notes"], fields: { verdict: "string" as const, notes: "string" as const } };
  const structured = await readArtifact(dir, "verdict.json", schema);
  assert.equal(structured?.validation?.ok, true);

  const missing = await readArtifact(dir, "nope.json", schema);
  assert.equal(missing, undefined);

  rmSync(dir, { recursive: true, force: true });
});
