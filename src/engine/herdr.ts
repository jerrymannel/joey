import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "./logger.ts";

const hlog = log("herdr");

/** A herdr tab created to run a job, and the pane inside it to run commands in. */
export interface HerdrTab {
  tabId: string;
  paneId: string;
}

/** How long a single command gets to finish before `runInPane` gives up and throws, rather than hanging indefinitely on a sentinel that never arrives. */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/** Single-quotes a value for safe use in a real shell — a command run via `runInPane` is typed into the herdr pane's live bash, not passed through execFile's argv, so every arg needs real shell quoting rather than execFile's own escaping. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** What herdr said when a command failed: its JSON error (printed on stdout or stderr), else the raw stderr, else the process error. */
function failureMessage(err: Error, stdout: string, stderr: string): string {
  for (const text of [stdout, stderr]) {
    try {
      const message = JSON.parse(text)?.error?.message;
      if (message) return message;
    } catch {}
  }
  return stderr.trim() || err.message;
}

function cli(args: string[], timeoutMs: number): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    hlog.debug({ args: args.map((a) => (a.length > 200 ? `${a.slice(0, 200)}…` : a)) }, "herdr command");
    // JOEY_HERDR_BIN lets the tests stand in a fake herdr.
    execFile(/* turbopackIgnore: true */ process.env.JOEY_HERDR_BIN ?? "herdr", args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        const message = failureMessage(err, stdout, stderr);
        hlog.error({ args: args.slice(0, 3), err: message }, "herdr command failed");
        return reject(new Error(message));
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch {
        resolvePromise(stdout);
      }
    });
  });
}

/** Creates a new herdr tab (and its root pane), cwd'd to `cwd`, for a job to run in. */
export async function createTab(cwd: string, label: string): Promise<HerdrTab> {
  const res = await cli(["tab", "create", "--cwd", cwd, "--label", label, "--no-focus"], DEFAULT_TIMEOUT_MS);
  return { tabId: res.result.tab.tab_id, paneId: res.result.root_pane.pane_id };
}

/** Closes a tab created with `createTab`. Throws on failure — callers that need this best-effort should report the outcome rather than let it disappear silently. */
export async function closeTab(tabId: string): Promise<void> {
  await cli(["tab", "close", tabId], DEFAULT_TIMEOUT_MS);
}

/** The exact text `runInPane` sends to the pane for `command`. */
export function commandWithSentinel(command: string, token: string): string {
  return `${command} ; echo ${token}:$?`;
}

/**
 * Runs `command` in `paneId` and waits for it to actually finish. Appends a caller-unique
 * sentinel (`token`) rather than matching the command's own text — herdr echoes typed input
 * back immediately, before it runs, and `wait-output` matches against the pane's existing
 * scrollback too, so a reused or predictable token can report "done" before the command ever
 * executes. Use a fresh token per call.
 *
 * Throws if the command's real exit code was non-zero, or if it didn't finish within
 * `timeoutMs` (default 30 minutes) — a bounded wait so a stuck pane fails loudly instead of
 * hanging the caller forever.
 */
export async function runInPane(paneId: string, command: string, token: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const exitCode = await runInPaneExit(paneId, command, token, timeoutMs);
  if (exitCode !== 0) throw new Error(`command failed with exit code ${exitCode}: ${command}`);
}

/** `runInPane` for callers that want a non-zero exit as a value rather than an error. Still throws if herdr fails or the wait times out. */
export async function runInPaneExit(paneId: string, command: string, token: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<number> {
  // herdr types the line into the pane's live shell; a long one can be split by the shell's prompt appearing mid-typing and
  // never run (seen with a script step's `env …` line). So the command goes in a private file and only a short `. <file>` is
  // typed — sourced, not run in a subshell, so an `export` still reaches the commands typed after it.
  const dir = mkdtempSync(join(tmpdir(), "joey-cmd-"));
  const file = join(dir, "cmd.sh");
  writeFileSync(file, `${command}\n`, { mode: 0o600 });
  try {
    await cli(["pane", "run", paneId, commandWithSentinel(`. ${shellQuote(file)}`, token)], timeoutMs);
    const wait = await cli(["pane", "wait-output", paneId, "--regex", `${token}:\\d+`, "--timeout", String(timeoutMs)], timeoutMs + 5000);
    return Number(/:(\d+)$/.exec(wait?.result?.matched_line ?? "")?.[1] ?? "1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A command line for a pane that runs `script` under bash with pipefail, whatever shell the pane has — so `cmd | tee file` still reports `cmd`'s exit code. */
export function bashPipeline(script: string): string {
  return `bash -c ${shellQuote(`set -o pipefail; ${script}`)}`;
}

/**
 * Runs one command in a herdr tab of its own (cwd'd to `cwd`, so a person can watch it), waits, and closes the tab — the way every command Joey runs
 * that isn't herdr itself goes. A non-zero exit is a result, not an error (`exitCode`); running past `timeoutMs` gives `timedOut` (and the closed tab
 * ends the command). Only herdr itself failing throws. Nothing is captured: a caller that needs output makes the command write it to a file.
 */
export async function runInTab(cwd: string, label: string, command: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{ exitCode: number | null; timedOut: boolean }> {
  const tab = await createTab(cwd, label);
  try {
    return { exitCode: await runInPaneExit(tab.paneId, command, newToken(), timeoutMs), timedOut: false };
  } catch (err) {
    if (/timed out/i.test((err as Error).message)) return { exitCode: null, timedOut: true };
    throw err;
  } finally {
    await closeTab(tab.tabId).catch((err) => hlog.warn({ tabId: tab.tabId, err: (err as Error).message }, "couldn't close the herdr tab"));
  }
}

/** Launches an interactive agent (`kind`, e.g. "pi", with `args`) in `paneId` — which must be at a shell prompt — under the herdr-wide `name`, and waits until it's ready for input. */
export async function startAgent(name: string, kind: string, paneId: string, args: string[], timeoutMs = 60_000): Promise<void> {
  await cli(["agent", "start", name, "--kind", kind, "--pane", paneId, "--timeout", String(timeoutMs), "--", ...args], timeoutMs + 5000);
}

/**
 * Submits `text` to agent `name` and waits for that turn to settle, returning the state it settled in: `idle`/`done` (finished) or `blocked`
 * (waiting on a person). Only states after the submission count, so a previous turn's `done` can't end the wait. Throws past `timeoutMs`.
 */
export async function promptAgent(name: string, text: string, timeoutMs: number): Promise<string> {
  const res = await cli(["agent", "prompt", name, text, "--wait", "--timeout", String(timeoutMs)], timeoutMs + 5000);
  return res?.result?.agent?.agent_status ?? "";
}

/** Generates a token unique to this call, for `runInPane`. */
export function newToken(): string {
  return `HERDR_DONE_${randomUUID()}`;
}
