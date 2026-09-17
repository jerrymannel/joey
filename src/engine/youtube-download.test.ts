import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { describeDownloadCommands } from "./youtube-download.ts";

test("describeDownloadCommands previews the mkdir setup, the herdr tab wrapping the job, each yt-dlp step, and the tab close, separated into groups", () => {
  const { cwd, commands } = describeDownloadCommands("abc123", "/workspace");
  const dir = join("/workspace", "abc123");
  const text = commands.join("\n");

  assert.equal(cwd, dir);
  assert.equal(commands[0], `mkdir -p '${dir}'`);
  assert.equal(commands[1], "");
  assert.match(text, /herdr tab create --cwd .*abc123.* --label .*yt-dlp:abc123.* --no-focus/);
  assert.equal(commands.at(-1), "herdr tab close <tab-id>");

  for (const [state, outputPrefix, pattern] of [
    ["metadata", "info", /'--write-info-json'/],
    ["video", "video", /'-f' 'bv\*\+ba\/b'/],
    ["audio", "audio", /'--audio-format' 'mp3'/],
    ["subtitles", "subtitles", /'--write-subs'/],
  ] as const) {
    const token = `HERDR_DONE_abc123_${state}`;
    assert.match(text, pattern);
    assert.match(text, new RegExp(`herdr pane run <pane-id> .*${pattern.source}.*${token}:\\$\\?`));
    // yt-dlp's own output template has a bare `(` — every arg must be individually
    // single-quoted (not just tokens with whitespace), or a real bash would choke on it.
    assert.match(text, new RegExp(`'-o' '${outputPrefix}\\.%\\(ext\\)s'`));
    assert.ok(text.includes(`herdr pane wait-output <pane-id> --regex "${token}:\\d+"`), `expected wait-output for ${token}`);
  }

  // Every group (setup, tab create, each of the 4 steps, tab close) is separated by a blank line.
  assert.equal(commands.filter((c) => c === "").length, 6);
});
