import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { AgentState, TabCreateResult, WorkspaceCreateResult } from "./types.ts";
import { HerdrCommandError } from "./types.ts";

const execFileAsync = promisify(execFile);

interface HerdrEnvelope {
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}

function envArgs(env?: Record<string, string>): string[] {
  if (!env) return [];
  return Object.entries(env).flatMap(([k, v]) => ["--env", `${k}=${v}`]);
}

function parseErrorPayload(text: string): { code: string; message: string } | undefined {
  try {
    const parsed = JSON.parse(text) as HerdrEnvelope;
    return parsed.error;
  } catch {
    return undefined;
  }
}

/** Runs `herdr <args>` and parses the `{id, result}` / `{id, error}` JSON envelope on stdout. */
async function runJson(args: string[]): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync("herdr", args);
    const envelope = JSON.parse(stdout) as HerdrEnvelope;
    if (envelope.error) throw new HerdrCommandError(envelope.error.code, envelope.error.message);
    return envelope.result;
  } catch (err) {
    if (err instanceof HerdrCommandError) throw err;
    const stdout = (err as { stdout?: string }).stdout ?? "";
    const stderr = (err as { stderr?: string }).stderr ?? "";
    const payload = parseErrorPayload(stdout) ?? parseErrorPayload(stderr);
    if (payload) throw new HerdrCommandError(payload.code, payload.message);
    throw err;
  }
}

/** Runs `herdr <args>` and returns raw stdout text (used by commands that return terminal content, not JSON). */
async function runText(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("herdr", args);
    return stdout;
  } catch (err) {
    const stdout = (err as { stdout?: string }).stdout ?? "";
    const stderr = (err as { stderr?: string }).stderr ?? "";
    const payload = parseErrorPayload(stdout) ?? parseErrorPayload(stderr);
    if (payload) throw new HerdrCommandError(payload.code, payload.message);
    throw err;
  }
}

/** Agent names must match ^[a-z][a-z0-9_-]{0,31}$ and be unique among *live* agents. */
export function generateAgentName(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export async function workspaceCreate(opts: {
  cwd: string;
  label: string;
  env?: Record<string, string>;
}): Promise<WorkspaceCreateResult> {
  const result = (await runJson([
    "workspace",
    "create",
    "--cwd",
    opts.cwd,
    "--label",
    opts.label,
    "--no-focus",
    ...envArgs(opts.env),
  ])) as {
    workspace: { workspace_id: string };
    tab: { tab_id: string };
    root_pane: { pane_id: string };
  };
  return {
    workspaceId: result.workspace.workspace_id,
    rootTabId: result.tab.tab_id,
    rootPaneId: result.root_pane.pane_id,
  };
}

export async function tabCreate(opts: {
  workspaceId: string;
  cwd: string;
  label: string;
  env?: Record<string, string>;
}): Promise<TabCreateResult> {
  const result = (await runJson([
    "tab",
    "create",
    "--workspace",
    opts.workspaceId,
    "--cwd",
    opts.cwd,
    "--label",
    opts.label,
    "--no-focus",
    ...envArgs(opts.env),
  ])) as { tab: { tab_id: string }; root_pane: { pane_id: string } };
  return { tabId: result.tab.tab_id, rootPaneId: result.root_pane.pane_id };
}

/** Launches an interactive agent (e.g. `pi`) in an existing at-prompt pane and registers it as a tracked agent. */
export async function agentStart(opts: {
  name: string;
  kind: string;
  paneId: string;
  args?: string[];
  timeoutMs?: number;
}): Promise<void> {
  const cliArgs = ["agent", "start", opts.name, "--kind", opts.kind, "--pane", opts.paneId];
  if (opts.timeoutMs) cliArgs.push("--timeout", String(opts.timeoutMs));
  if (opts.args?.length) cliArgs.push("--", ...opts.args);
  await runJson(cliArgs);
}

/** `target` may be a live agent name or the pane ID hosting it. Fire-and-forget unless `wait` is set. */
export async function agentPrompt(
  target: string,
  text: string,
  opts?: { wait?: boolean; until?: AgentState[]; timeoutMs?: number },
): Promise<void> {
  const args = ["agent", "prompt", target, text];
  if (opts?.wait) args.push("--wait");
  for (const state of opts?.until ?? []) args.push("--until", state);
  if (opts?.timeoutMs) args.push("--timeout", String(opts.timeoutMs));
  await runJson(args);
}

/** Non-blocking current-state read (used by the orchestrator's own poll loop). */
export async function agentGet(target: string): Promise<AgentState> {
  const result = (await runJson(["agent", "get", target])) as { agent_status: AgentState };
  return result.agent_status;
}

export async function agentWait(
  target: string,
  opts?: { until?: AgentState[]; timeoutMs?: number },
): Promise<AgentState> {
  const args = ["agent", "wait", target];
  for (const state of opts?.until ?? []) args.push("--until", state);
  if (opts?.timeoutMs) args.push("--timeout", String(opts.timeoutMs));
  await runJson(args);
  return agentGet(target);
}

/** Raw terminal text, not JSON. `visible` is the reliably-populated source for a short-lived pane. */
export async function agentRead(
  target: string,
  opts?: { source?: "visible" | "recent" | "recent-unwrapped"; lines?: number },
): Promise<string> {
  const args = ["agent", "read", target, "--source", opts?.source ?? "visible"];
  if (opts?.lines) args.push("--lines", String(opts.lines));
  return runText(args);
}

/** Literal command text for the human to run in their own terminal — never executed by this app. */
export function attachCommand(target: string): string {
  return `herdr agent attach ${target}`;
}
