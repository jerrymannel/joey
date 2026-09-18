import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";

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

function cli(args: string[], timeoutMs: number): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    execFile("herdr", args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr.trim() || err.message));
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
  await cli(["pane", "run", paneId, commandWithSentinel(command, token)], timeoutMs);
  const wait = await cli(["pane", "wait-output", paneId, "--regex", `${token}:\\d+`, "--timeout", String(timeoutMs)], timeoutMs + 5000);
  const exitCode = Number(/:(\d+)$/.exec(wait?.result?.matched_line ?? "")?.[1] ?? "1");
  if (exitCode !== 0) throw new Error(`command failed with exit code ${exitCode}: ${command}`);
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
