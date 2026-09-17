import { test } from "node:test";
import assert from "node:assert/strict";
import { commandWithSentinel, describeCloseTab, describeCreateTab, describeRunInPane, newToken } from "./herdr.ts";

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
