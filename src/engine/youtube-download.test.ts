import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeDownloadCommands, enqueue, getDownloadJob, startDownload } from "./youtube-download.ts";
import { installFakeHerdr } from "../test-support/fake-herdr.ts";

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

test("enqueue runs jobs one at a time in order, and a crashing job doesn't block the ones behind it", async () => {
  const events: string[] = [];
  const job = (name: string, ms: number, fail = false) => async () => {
    events.push(`start ${name}`);
    await new Promise((r) => setTimeout(r, ms));
    events.push(`end ${name}`);
    if (fail) throw new Error("boom");
  };
  await Promise.all([enqueue(job("a", 20)), enqueue(job("b", 1, true)), enqueue(job("c", 1))]);
  assert.deepEqual(events, ["start a", "end a", "start b", "end b", "start c", "end c"]);
});

test("with transcribe, a finished download also gets a whisper transcript of audio.mp3 (state `transcribing` on the way); a failing transcription fails the job; without it nothing is transcribed", async () => {
  const root = mkdtempSync(join(tmpdir(), "joey-yt-test-"));
  process.env.LOGS_DB_PATH = join(root, "logs.db");
  const { calls } = installFakeHerdr(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  // Stand-ins: yt-dlp "downloads" audio.mp3 into the tab's folder; whisper writes "hello" as the transcript (unless the audio is named bad).
  writeFileSync(join(bin, "yt-dlp"), '#!/bin/sh\ncase "$*" in *audio*) echo x > audio.mp3;; esac\n');
  writeFileSync(join(bin, "whisper"), '#!/bin/sh\nf="$1"; while [ $# -gt 0 ]; do [ "$1" = "--output_dir" ] && out="$2"; shift; done\nn=$(basename "$f")\n[ -f "$(dirname "$f")/fail" ] && { echo boom >&2; exit 1; }\necho hello > "$out/${n%.*}.txt"\n');
  for (const name of ["yt-dlp", "whisper"]) chmodSync(join(bin, name), 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  const finished = async (videoId: string) => {
    for (let i = 0; i < 200 && ACTIVE.has(getDownloadJob(videoId)?.state ?? "queued"); i++) await new Promise((r) => setTimeout(r, 50));
    return getDownloadJob(videoId)!;
  };
  const ACTIVE = new Set(["queued", "metadata", "video", "audio", "subtitles", "transcribing"]);
  try {
    startDownload("v1", "one", root, true);
    assert.equal((await finished("v1")).state, "done");
    assert.equal(readFileSync(join(root, "v1", "audio.mp3.transcribed.txt"), "utf8"), "hello\n");
    assert.match(readFileSync(calls, "utf8"), /--label whisper:audio\.mp3/);

    startDownload("v2", "two", root); // transcribe off
    assert.equal((await finished("v2")).state, "done");
    assert.equal(existsSync(join(root, "v2", "audio.mp3.transcribed.txt")), false);

    mkdirSync(join(root, "v3"));
    writeFileSync(join(root, "v3", "fail"), "");
    startDownload("v3", "three", root, true);
    const failed = await finished("v3");
    assert.equal(failed.state, "failed");
    assert.match(failed.error ?? "", /whisper failed: .*boom/);
  } finally {
    process.env.PATH = path;
    delete process.env.JOEY_HERDR_BIN;
    delete process.env.LOGS_DB_PATH;
    rmSync(root, { recursive: true, force: true });
  }
});
