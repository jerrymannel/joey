import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandWithSentinel, newToken, runInTab } from "./herdr.ts";
import { installFakeHerdr } from "../test-support/fake-herdr.ts";

test("newToken never repeats", () => {
  assert.notEqual(newToken(), newToken());
});

test("commandWithSentinel appends an unconditional exit-code echo", () => {
  assert.equal(commandWithSentinel("false", "T1"), "false ; echo T1:$?");
});

test("runInTab returns a non-zero exit as a value, reports a timeout, and closes its tab either way", async () => {
  const dir = mkdtempSync(join(tmpdir(), "joey-herdr-test-"));
  const { calls } = installFakeHerdr(dir);
  try {
    assert.deepEqual(await runInTab(dir, "t", "sh -c 'exit 3'"), { exitCode: 3, timedOut: false });
    assert.deepEqual(await runInTab(dir, "t", "sleep 5", 300), { exitCode: null, timedOut: true });
    assert.equal(readFileSync(calls, "utf8").split("\n").filter((l) => l.startsWith("tab close")).length, 2);
  } finally {
    delete process.env.JOEY_HERDR_BIN;
    rmSync(dir, { recursive: true, force: true });
  }
});
