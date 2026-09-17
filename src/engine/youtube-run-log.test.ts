import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function freshRunLog() {
  const dir = mkdtempSync(join(tmpdir(), "joey-youtube-run-log-test-"));
  process.env.DATA_DB_PATH = join(dir, "data.db");
  process.env.LOGS_DB_PATH = join(dir, "logs.db");
  const mod = await import(`./youtube-run-log.ts?t=${Date.now()}-${Math.random()}`);
  return { mod, dir };
}

test("createYoutubeRun starts queued, updateYoutubeRunStatus tracks state and end time", async () => {
  const { mod, dir } = await freshRunLog();
  const run = mod.createYoutubeRun("abc123", "A video", "/workspace/abc123");
  assert.equal(run.status, "queued");
  assert.equal(run.endedAt, null);

  mod.updateYoutubeRunStatus(run.id, "video");
  assert.equal(mod.getYoutubeRun(run.id).status, "video");
  assert.equal(mod.getYoutubeRun(run.id).endedAt, null);

  mod.updateYoutubeRunStatus(run.id, "failed", { errorMessage: "yt-dlp exited with code 1" });
  const failed = mod.getYoutubeRun(run.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorMessage, "yt-dlp exited with code 1");
  assert.notEqual(failed.endedAt, null);

  assert.deepEqual(mod.listYoutubeRuns().map((r: any) => r.id), [run.id]);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
