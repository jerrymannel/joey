import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { log } from "./logger.ts";

const hlog = log("herdr");

/** A herdr tab created to run a job, and the pane inside it to run commands in. */
export interface HerdrTab {
  tabId: string;
  paneId: string;
}

/** How long a single command gets to finish before `runInPane` gives up and throws, rather than hanging indefinitely on a sentinel that never arrives. */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

function quote(value: string): string {
  return /[\s\\]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

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

/** The exact text `runInPane` sends to the pane for `command` — exposed so a preview (e.g. a Simulate feature) can show precisely what would run, without running it. */
export function commandWithSentinel(command: string, token: string): string {
  return `${command} ; echo ${token}:$?`;
}

/**
 * Runs `command` in `paneId` and waits for it to actually finish. Appends a caller-unique
 * sentinel (`token`) rather than matching the command's own text — herdr echoes typed input
 * back immediately, before it runs, and `wait-output` matches against the pane's existing
 * scrollback too, so a reused or predictable token can report "done" before the command ever
 * executes. Use a fresh token per call (see `describeRunInPane` for previewing without one).
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
  await cli(["pane", "run", paneId, commandWithSentinel(command, token)], timeoutMs);
  const wait = await cli(["pane", "wait-output", paneId, "--regex", `${token}:\\d+`, "--timeout", String(timeoutMs)], timeoutMs + 5000);
  return Number(/:(\d+)$/.exec(wait?.result?.matched_line ?? "")?.[1] ?? "1");
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

/** Generates a token unique to this call, for `runInPane`. */
export function newToken(): string {
  return `HERDR_DONE_${randomUUID()}`;
}

/** Human-readable preview of the commands `createTab`/`runInPane`/`closeTab` would run for one command — for display only (e.g. a Simulate feature), nothing is run. `token` is caller-supplied so the preview stays stable across renders (`newToken()` is only for a real run). */
export function describeCreateTab(cwd: string, label: string): string {
  return `herdr tab create --cwd ${quote(cwd)} --label ${quote(label)} --no-focus`;
}

export function describeRunInPane(command: string, token: string): string[] {
  return [
    `herdr pane run <pane-id> ${quote(commandWithSentinel(command, token))}`,
    `herdr pane wait-output <pane-id> --regex ${quote(`${token}:\\d+`)}`,
  ];
}

export function describeCloseTab(): string {
  return "herdr tab close <tab-id>";
}
