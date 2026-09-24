import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandWithSentinel, describeCloseTab, describeCreateTab, describeRunInPane, newToken, runInTab } from "./herdr.ts";
import { installFakeHerdr } from "../test-support/fake-herdr.ts";

test("describeCreateTab/describeRunInPane/describeCloseTab preview the exact text runInPane would send, without a live token repeating between calls", () => {
  assert.equal(describeCreateTab("/work/dir", "job:1"), "herdr tab create --cwd /work/dir --label job:1 --no-focus");

  const token = "TOKEN_abc";
  const [run, wait] = describeRunInPane("echo hi", token);
  assert.equal(run, `herdr pane run <pane-id> ${JSON.stringify(commandWithSentinel("echo hi", token))}`);
  assert.equal(wait, `herdr pane wait-output <pane-id> --regex "${token}:\\d+"`);

  assert.equal(describeCloseTab(), "herdr tab close <tab-id>");

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
