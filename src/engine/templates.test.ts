import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { template } from "./templates.ts";

test("template reads src/engine/templates/<name>.md, substitutes {{vars}} and drops the trailing newline", () => {
  assert.equal(template("step-input", { step: 2, label: "agent a", content: "hi" }), "\n## Output of step 2 (agent a)\n\nhi");
  assert.match(template("verdict-reminder"), /^You didn't call task_review_verdict/);
});

test("TEMPLATES_DIR overrides the folder (edits apply on the next read); an unknown {{var}} is left alone; a missing file names its path", () => {
  const dir = mkdtempSync(join(tmpdir(), "joey-templates-test-"));
  process.env.TEMPLATES_DIR = dir;
  try {
    writeFileSync(join(dir, "x.md"), "a {{one}} b {{two}}\n");
    assert.equal(template("x", { one: "1" }), "a 1 b {{two}}");
    writeFileSync(join(dir, "x.md"), "changed\n");
    assert.equal(template("x"), "changed");
    assert.throws(() => template("nope"), new RegExp(`can't read the template ${join(dir, "nope.md").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  } finally {
    delete process.env.TEMPLATES_DIR;
    rmSync(dir, { recursive: true });
  }
});
