import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as herdr from "./herdr.ts";
import { loadModels, type AgentDef, type McpServer, type Model } from "./definitions.ts";
import { log } from "./logger.ts";

const alog = log("agent");

/** Absolute: pi runs cwd'd to the task's folder, not this repo. */
export const PI_TOOLS_EXTENSION = resolve(/* turbopackIgnore: true */ process.cwd(), "pi-tools/index.ts");

/** pi's global provider catalog; JOEY_PI_MODELS_PATH overrides it (tests). */
const piModelsPath = () => process.env.JOEY_PI_MODELS_PATH ?? join(homedir(), ".pi", "agent", "models.json");

/** A pi provider key Joey owns for a local model (kept apart from the user's own providers). */
const localProvider = (name: string) => `joey-${name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`;

/** The `--model` string pi needs: a local model becomes `<joey-provider>/<name>`; anything else is already a `provider/id`. */
export function resolvePiModel(model: string, models: Model[] = loadModels()): string {
  const local = models.find((m) => m.endpoint && m.name === model);
  return local ? `${localProvider(local.name)}/${local.name}` : model;
}

/** Registers every local model from models.yaml as an OpenAI-compatible provider in pi's global catalog (merged, so the user's own providers stay). */
export function ensureLocalModels(models: Model[] = loadModels()): void {
  const locals = models.filter((m) => m.endpoint);
  if (locals.length === 0) return;
  const path = piModelsPath();
  const cfg = (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {}) as { providers?: Record<string, unknown> };
  cfg.providers ??= {};
  for (const m of locals) {
    cfg.providers[localProvider(m.name)] = { baseUrl: m.endpoint, api: "openai-completions", apiKey: "joey", models: [{ id: m.name, name: m.name }] };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2));
}

/** The `pi` arguments for an agent — its session dir, model, thinking, Joey's tools extension, all MCP servers (when any) and every skill. */
export function piArgs(agent: AgentDef, sessionDir: string, mcpConfigPath: string | null, skills: string[] = []): string[] {
  const args = ["--session-dir", sessionDir, "--model", resolvePiModel(agent.model), "--extension", PI_TOOLS_EXTENSION];
  if (agent.thinking) args.push("--thinking", agent.thinking);
  if (mcpConfigPath) args.push("--mcp-config", mcpConfigPath);
  for (const skill of skills) args.push("--skill", skill);
  return args;
}

/** The env exported into an agent's pane on top of the run env — nothing secret; pi-tools read the rest from the databases. */
export function agentEnv(runEnv: Record<string, string>, agentId: string, verdictFile: string): Record<string, string> {
  // LOG_CONSOLE=off: pi-tools log from pi's process, whose terminal is pi's own screen — the log file only.
  return { ...runEnv, LOG_CONSOLE: "off", JOEY_AGENT: agentId, JOEY_VERDICT_FILE: verdictFile };
}

/**
 * One agent of a run: an interactive pi in a herdr tab of its own, alive for the whole run so every step it's used in continues the same
 * conversation. Joey types a message with `herdr agent prompt`, waits for the turn to settle, and reads the reply from pi's session file
 * (JSONL, one per agent since each gets its own `--session-dir`) — never from the terminal. Proven in docs/redesign.md's spike.
 */
export interface AgentSession {
  agent: string;
  /** herdr-wide agent name; unique per run. */
  herdrName: string;
  tabId: string;
  sessionDir: string;
  /** Where the review_verdict tool writes (JOEY_VERDICT_FILE). */
  verdictFile: string;
}

/** herdr's rule for agent names: a lowercase letter first, then lowercase letters, digits, `-` or `_`, 32 characters at most. */
export const HERDR_AGENT_NAME = /^[a-z][a-z0-9_-]{0,31}$/;

/**
 * A herdr-wide agent name that fits HERDR_AGENT_NAME: the run id keeps it unique across runs, the agent's position in its task keeps it
 * unique within one (even if two agent names share a long prefix), and as much of the agent's own name as fits keeps it recognisable.
 */
export function herdrAgentName(runId: string, index: number, agent: string): string {
  const safe = agent.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return `joey-${runId.slice(0, 8)}-${index}-${safe}`.slice(0, 32).replace(/-+$/, "");
}

type PiContent = { type: string; text?: string; name?: string; arguments?: unknown }[];
export type PiMessage = { role: string; content?: unknown[]; toolName?: string; isError?: boolean; stopReason?: string; errorMessage?: string };

function formatPiContent(content: PiContent): string {
  return content
    .map((c) => (c.type === "text" ? c.text : c.type === "toolCall" ? `→ ${c.name}(${JSON.stringify(c.arguments)})` : ""))
    .filter(Boolean)
    .join("\n");
}

/** One pi message as plain text for a run log: assistant text and `→ tool(args)` calls, `✓`/`✗` tool results; user/other messages give "". */
export function formatPiMessage(message: PiMessage): string {
  if (message.role === "assistant") return formatPiContent((message.content ?? []) as PiContent);
  if (message.role === "toolResult") {
    const text = formatPiContent((message.content ?? []) as PiContent);
    return `${message.isError ? "✗" : "✓"} ${message.toolName}${text ? `: ${text}` : ""}`;
  }
  return "";
}

/** The messages in the agent's session file, oldest first ([] before its first turn). */
export function readMessages(sessionDir: string): PiMessage[] {
  const file = existsSync(sessionDir) ? readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl")).sort().at(-1) : undefined;
  if (!file) return [];
  const messages: PiMessage[] = [];
  for (const line of readFileSync(join(sessionDir, file), "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === "message" && entry.message) messages.push(entry.message);
    } catch {
      // a line still being written — the caller re-reads
    }
  }
  return messages;
}

export function exportLine(env: Record<string, string>): string {
  return `export ${Object.entries(env).map(([k, v]) => `${k}=${herdr.shellQuote(v)}`).join(" ")}`;
}

/**
 * Opens a herdr tab in `cwd`, exports `env` into its shell (nothing secret — pi-tools read the rest from the databases) and starts pi there
 * with the agent's model, thinking level, Joey's tools and — when it has any — a config holding only its own MCP servers.
 */
export async function openAgentSession(opts: {
  agent: AgentDef;
  /** A readable id for this agent step (its prompt basename), for JOEY_AGENT and logs. */
  agentId: string;
  herdrName: string;
  /** The herdr tab's label — free text, unlike `herdrName`. */
  label: string;
  cwd: string;
  /** This session's own folder (the caller keys it by step so two steps sharing a prompt don't collide). */
  sessionDir: string;
  env: Record<string, string>;
  /** Every server from mcp.json — every agent gets them all. */
  mcpServers: Record<string, McpServer>;
  /** Absolute skill paths from skills/ — every agent gets them all. */
  skills: string[];
}): Promise<AgentSession> {
  const { agent, agentId, sessionDir } = opts;
  ensureLocalModels();
  mkdirSync(sessionDir, { recursive: true });
  const verdictFile = join(sessionDir, "verdict.json");
  let mcpConfig: string | null = null;
  if (Object.keys(opts.mcpServers).length > 0) {
    mcpConfig = join(sessionDir, "mcp.json");
    writeFileSync(mcpConfig, JSON.stringify({ mcpServers: opts.mcpServers }, null, 2));
  }
  const args = piArgs(agent, sessionDir, mcpConfig, opts.skills);
  const env = agentEnv(opts.env, agentId, verdictFile);

  const tab = await herdr.createTab(opts.cwd, opts.label);
  try {
    const code = await herdr.runInPaneExit(tab.paneId, exportLine(env), herdr.newToken(), 30_000);
    if (code !== 0) throw new Error(`setting the agent's environment exited ${code}`);
    await herdr.startAgent(opts.herdrName, "pi", tab.paneId, args);
  } catch (err) {
    await herdr.closeTab(tab.tabId).catch(() => {});
    throw new Error(`couldn't start agent ${agentId}: ${(err as Error).message}`);
  }
  alog.info({ agent: agentId, herdrName: opts.herdrName, model: agent.model }, "agent started");
  return { agent: agentId, herdrName: opts.herdrName, tabId: tab.tabId, sessionDir, verdictFile };
}

/**
 * Sends `text` as one user message and returns the agent's final reply for that turn, plus the turn's transcript (replies, tool calls,
 * tool results) for the run log. Throws when the turn times out, ends blocked on a person, or pi reports an error.
 */
export async function ask(session: AgentSession, text: string, timeoutMs: number): Promise<{ reply: string; transcript: string }> {
  const before = readMessages(session.sessionDir).length;
  const status = await herdr.promptAgent(session.herdrName, text, timeoutMs);
  if (status === "blocked") throw new Error(`agent ${session.agent} is blocked waiting for input`);

  // herdr reports the turn settled from pi's screen; the session file can trail it by a moment.
  let turn: PiMessage[] = [];
  for (let i = 0; i < 20; i++) {
    turn = readMessages(session.sessionDir).slice(before);
    if (turn.at(-1)?.role === "assistant" && turn.at(-1)?.stopReason) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const last = turn.at(-1);
  if (last?.role !== "assistant") throw new Error(`agent ${session.agent} finished its turn without a reply`);
  if (last.stopReason === "error" || last.stopReason === "aborted") throw new Error(`agent ${session.agent}: ${last.errorMessage ?? last.stopReason}`);
  const reply = ((last.content ?? []) as PiContent).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
  return { reply, transcript: turn.map(formatPiMessage).filter(Boolean).join("\n\n") };
}

export async function closeAgentSession(session: AgentSession): Promise<void> {
  await herdr.closeTab(session.tabId).catch((err) => alog.warn({ agent: session.agent, err: (err as Error).message }, "couldn't close the agent's herdr tab"));
}
