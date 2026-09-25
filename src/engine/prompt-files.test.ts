import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promptFile } from "./prompt-files.ts";

test("promptFile reads templates/<name>.md from the repo, substitutes {{vars}} and drops the trailing newline", () => {
  assert.equal(promptFile("tools", { tools: "- a: b" }), "Available tools:\n- a: b");
  assert.match(promptFile("mailbox-instruction"), /^IMPORTANT — how this task ends/);
  assert.equal(promptFile("inbox", { count: 2, noun: "messages" }), "--- Inbox (2 messages) ---");
  assert.equal(promptFile("sender-prompt", { body: "hi", prompt: "p" }), "hi\n\n--- Sender's prompt ---\np");
});

test("PROMPTS_DIR overrides the folder (edits apply on the next read); an unknown {{var}} is left alone; a missing file names its path", () => {
  const dir = mkdtempSync(join(tmpdir(), "joey-prompts-test-"));
  process.env.PROMPTS_DIR = dir;
  try {
    writeFileSync(join(dir, "x.md"), "a {{one}} b {{two}}\n");
    assert.equal(promptFile("x", { one: "1" }), "a 1 b {{two}}");
    writeFileSync(join(dir, "x.md"), "changed\n");
    assert.equal(promptFile("x"), "changed");
    assert.throws(() => promptFile("nope"), new RegExp(`can't read the prompt file ${join(dir, "nope.md").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  } finally {
    delete process.env.PROMPTS_DIR;
    rmSync(dir, { recursive: true });
  }
});
