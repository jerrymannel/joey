import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { Task } from "./task-board.ts";

const root = mkdtempSync(join(tmpdir(), "joey-automation-test-"));
process.env.SETTINGS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");
process.env.DATA_DB_PATH = join(root, "data.db");
process.env.LOGS_DB_PATH = join(root, "logs.db");

const { saveGmailApp, addGmailAccount, setUsesGmailApp, addYoutubeAccount } = await import("./settings.ts");
const { runAutomation } = await import("./automation-run.ts");
const { createRun } = await import("./run-log.ts");

const task = (o: Partial<Task>) => ({ id: "t", name: "n", folderPath: root, service: "gmail", searchQuery: "is:unread", playlistId: "PL1", account: "", ...o }) as Task;

/** Stubs Google: records which refresh token each token request used, and answers list calls with nothing. */
function stubGoogle() {
  const refreshTokens: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      refreshTokens.push(new URLSearchParams(String(init!.body)).get("refresh_token")!);
      return new Response(JSON.stringify({ access_token: "at" }));
    }
    return new Response(JSON.stringify({ items: [] }));
  }) as typeof fetch;
  return { refreshTokens, restore: () => (globalThis.fetch = realFetch) };
}

test("a gmail/youtube automation runs as its chosen account; empty means the first connected one", async () => {
  saveGmailApp({ clientId: "id", clientSecret: "s" });
  setUsesGmailApp("youtube", true);
  addGmailAccount({ email: "a@x.com", refreshToken: "rt-a" });
  addGmailAccount({ email: "b@x.com", refreshToken: "rt-b" });
  addYoutubeAccount({ email: "a@x.com", refreshToken: "yt-a" });
  addYoutubeAccount({ email: "b@x.com", refreshToken: "yt-b" });
  const g = stubGoogle();
  try {
    for (const [t, expected] of [
      [task({ account: "b@x.com" }), "rt-b"],
      [task({ account: "" }), "rt-a"],
      [task({ service: "youtube", account: "b@x.com" }), "yt-b"],
    ] as const) {
      g.refreshTokens.length = 0;
      await runAutomation(t, createRun("t").id);
      assert.equal(g.refreshTokens[0], expected);
    }
    await assert.rejects(runAutomation(task({ account: "gone@x.com" }), createRun("t").id), /not connected/);
  } finally {
    g.restore();
    rmSync(root, { recursive: true });
  }
});
