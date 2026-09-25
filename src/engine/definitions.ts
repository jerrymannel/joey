import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { cronIsValid } from "./cron.ts";
import { listTools } from "./tools.ts";

/**
 * The hand-edited definitions Joey runs (docs/redesign.md): `tasks/<slug>.yaml`, `scripts.yaml`, `prompts/<name>.md`
 * and `mcp.json`, all under JOEY_HOME (default: the repo, i.e. cwd). Read on every call — an edit applies to the next run.
 */
export function joeyHome(): string {
  return resolve(/* turbopackIgnore: true */ process.env.JOEY_HOME ?? process.cwd());
}
const at = (...parts: string[]) => join(/* turbopackIgnore: true */ joeyHome(), ...parts);

export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_MAX_ROUNDS = 3;

export interface AgentDef {
  name: string;
  /** File name under prompts/. */
  prompt: string;
  model: string;
  thinking: string;
  tools: string[];
  mcp: string[];
}

export type StepDef =
  | { kind: "script"; script: string; params: Record<string, unknown>; timeoutMs: number }
  /** `reviews` is the 0-based index of the earlier agent step this one reviews. */
  | { kind: "agent"; agent: string; instruction: string; reviews?: number; maxRounds: number; timeoutMs: number };

export interface TaskDef {
  slug: string;
  name: string;
  schedule: string | null;
  agents: Record<string, AgentDef>;
  steps: StepDef[];
}

export interface ScriptParam {
  description: string;
  required: boolean;
}

export interface ScriptDef {
  name: string;
  /** Relative to JOEY_HOME; `.ts` runs with tsx, anything else is executed directly. */
  command: string;
  description: string;
  params: Record<string, ScriptParam>;
}

export interface McpServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  [key: string]: unknown;
}

/** A task file as found: `task` is set only when it validated; otherwise `errors` says why. */
export interface TaskFile {
  slug: string;
  task?: TaskDef;
  errors: string[];
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const THINKING = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const stringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** `90s`, `30m`, `2h`, or a bare number of minutes. */
export function parseTimeout(value: unknown): number | null {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (typeof value === "number" && value > 0) return value * 60_000;
  const m = typeof value === "string" ? /^(\d+)\s*(s|m|h)$/.exec(value.trim()) : null;
  if (!m || Number(m[1]) === 0) return null;
  return Number(m[1]) * { s: 1000, m: 60_000, h: 3_600_000 }[m[2] as "s" | "m" | "h"];
}

function readYaml(path: string): unknown {
  return parse(readFileSync(/* turbopackIgnore: true */ path, "utf8"));
}

export function promptPath(file: string): string {
  return at("prompts", file);
}

export function listPrompts(): string[] {
  const dir = at("prompts");
  return existsSync(/* turbopackIgnore: true */ dir) ? readdirSync(/* turbopackIgnore: true */ dir).filter((f) => f.endsWith(".md")).sort() : [];
}

export function loadScripts(): { scripts: Record<string, ScriptDef>; errors: string[] } {
  const path = at("scripts.yaml");
  if (!existsSync(/* turbopackIgnore: true */ path)) return { scripts: {}, errors: [] };
  let raw: unknown;
  try {
    raw = readYaml(path) ?? {};
  } catch (err) {
    return { scripts: {}, errors: [`scripts.yaml: ${(err as Error).message}`] };
  }
  if (!isRecord(raw)) return { scripts: {}, errors: ["scripts.yaml: must be a map of script name → definition"] };
  const scripts: Record<string, ScriptDef> = {};
  const errors: string[] = [];
  for (const [name, def] of Object.entries(raw)) {
    const where = `scripts.yaml ${name}`;
    if (!isRecord(def) || typeof def.command !== "string" || !def.command) {
      errors.push(`${where}: needs a command`);
      continue;
    }
    if (!existsSync(/* turbopackIgnore: true */ at(def.command))) errors.push(`${where}: ${def.command} not found`);
    const params: Record<string, ScriptParam> = {};
    for (const [p, spec] of Object.entries(isRecord(def.params) ? def.params : {})) {
      const s = isRecord(spec) ? spec : {};
      params[p] = { description: typeof s.description === "string" ? s.description : "", required: s.required === true };
    }
    scripts[name] = { name, command: def.command, description: typeof def.description === "string" ? def.description : "", params };
  }
  return { scripts, errors };
}

export function loadMcpServers(): { servers: Record<string, McpServer>; errors: string[] } {
  const path = at("mcp.json");
  if (!existsSync(/* turbopackIgnore: true */ path)) return { servers: {}, errors: [] };
  try {
    const raw = JSON.parse(readFileSync(/* turbopackIgnore: true */ path, "utf8"));
    if (!isRecord(raw?.mcpServers)) return { servers: {}, errors: ['mcp.json: needs an "mcpServers" object'] };
    return { servers: raw.mcpServers as Record<string, McpServer>, errors: [] };
  } catch (err) {
    return { servers: {}, errors: [`mcp.json: ${(err as Error).message}`] };
  }
}

function checkAgent(name: string, raw: unknown, ctx: { tools: Set<string>; mcp: Set<string> }, errors: string[]): AgentDef | undefined {
  const where = `agent ${name}`;
  if (!isRecord(raw)) return void errors.push(`${where}: must be a map`);
  const agent: AgentDef = {
    name,
    prompt: typeof raw.prompt === "string" ? raw.prompt : "",
    model: typeof raw.model === "string" ? raw.model : "",
    thinking: typeof raw.thinking === "string" ? raw.thinking : "",
    tools: stringList(raw.tools) ? raw.tools : [],
    mcp: stringList(raw.mcp) ? raw.mcp : [],
  };
  if (!agent.prompt) errors.push(`${where}: needs a prompt (a file in prompts/)`);
  else if (!existsSync(/* turbopackIgnore: true */ promptPath(agent.prompt))) errors.push(`${where}: prompts/${agent.prompt} not found`);
  // ponytail: the model isn't checked against `pi --list-models` (seconds per call); a wrong one fails the run's first agent step.
  if (!agent.model) errors.push(`${where}: needs a model (pi's provider/id)`);
  if (agent.thinking && !THINKING.includes(agent.thinking)) errors.push(`${where}: thinking must be one of ${THINKING.join(", ")}`);
  if (raw.tools !== undefined && !stringList(raw.tools)) errors.push(`${where}: tools must be a list of tool names`);
  for (const t of agent.tools) if (!ctx.tools.has(t)) errors.push(`${where}: unknown tool ${t}`);
  if (raw.mcp !== undefined && !stringList(raw.mcp)) errors.push(`${where}: mcp must be a list of server names from mcp.json`);
  for (const m of agent.mcp) if (!ctx.mcp.has(m)) errors.push(`${where}: MCP server ${m} is not in mcp.json`);
  return agent;
}

function checkStep(i: number, raw: unknown, task: { agents: Record<string, AgentDef>; steps: StepDef[] }, scripts: Record<string, ScriptDef>, errors: string[]): StepDef | undefined {
  const where = `step ${i + 1}`;
  if (!isRecord(raw)) return void errors.push(`${where}: must be a map`);
  const timeoutMs = parseTimeout(raw.timeout);
  if (timeoutMs === null) errors.push(`${where}: timeout must look like 90s, 30m or 2h`);
  const isScript = typeof raw.script === "string";
  if (isScript === (typeof raw.agent === "string")) return void errors.push(`${where}: needs exactly one of script or agent`);

  if (typeof raw.script === "string") {
    const script = scripts[raw.script];
    const params = isRecord(raw.params) ? raw.params : {};
    if (raw.params !== undefined && !isRecord(raw.params)) errors.push(`${where}: params must be a map`);
    if (!script) errors.push(`${where}: script ${raw.script} is not in scripts.yaml`);
    else {
      for (const p of Object.keys(params)) if (!script.params[p]) errors.push(`${where}: script ${raw.script} has no param ${p}`);
      for (const [p, spec] of Object.entries(script.params)) if (spec.required && params[p] === undefined) errors.push(`${where}: script ${raw.script} needs param ${p}`);
    }
    return { kind: "script", script: raw.script, params, timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS };
  }

  const agent = raw.agent as string;
  if (!task.agents[agent]) errors.push(`${where}: agent ${agent} is not defined under agents`);
  if (typeof raw.instruction !== "string" || !raw.instruction.trim()) errors.push(`${where}: needs an instruction`);
  const step: StepDef = { kind: "agent", agent, instruction: typeof raw.instruction === "string" ? raw.instruction : "", maxRounds: DEFAULT_MAX_ROUNDS, timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS };
  if (raw.reviews !== undefined) {
    const n = raw.reviews;
    const target = typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= i ? task.steps[n - 1] : undefined;
    if (!target || target.kind !== "agent") errors.push(`${where}: reviews must be the number of an earlier agent step`);
    else if (target.agent === agent) errors.push(`${where}: an agent can't review its own step`);
    else step.reviews = (n as number) - 1;
  }
  if (raw.maxRounds !== undefined) {
    if (typeof raw.maxRounds === "number" && Number.isInteger(raw.maxRounds) && raw.maxRounds >= 1) step.maxRounds = raw.maxRounds;
    else errors.push(`${where}: maxRounds must be a whole number of at least 1`);
  }
  if (raw.maxRounds !== undefined && raw.reviews === undefined) errors.push(`${where}: maxRounds only applies with reviews`);
  return step;
}

/** Parses and validates `tasks/<slug>.yaml` against the current scripts, prompts, tools and MCP servers. */
export function loadTask(slug: string): TaskFile {
  const path = at("tasks", `${slug}.yaml`);
  if (!SLUG.test(slug)) return { slug, errors: [`"${slug}" isn't a valid task file name (lowercase letters, digits, dashes)`] };
  if (!existsSync(/* turbopackIgnore: true */ path)) return { slug, errors: [`tasks/${slug}.yaml not found`] };
  let raw: unknown;
  try {
    raw = readYaml(path);
  } catch (err) {
    return { slug, errors: [(err as Error).message] };
  }
  if (!isRecord(raw)) return { slug, errors: ["the file must be a map with name, agents and steps"] };

  const errors: string[] = [];
  const { scripts, errors: scriptErrors } = loadScripts();
  const { servers, errors: mcpErrors } = loadMcpServers();
  errors.push(...scriptErrors, ...mcpErrors);
  const ctx = { tools: new Set(listTools().map((t) => t.name)), mcp: new Set(Object.keys(servers)) };

  const schedule = raw.schedule === undefined || raw.schedule === null || raw.schedule === "" ? null : String(raw.schedule);
  if (schedule !== null && !cronIsValid(schedule)) errors.push(`schedule "${schedule}" isn't a 5-field cron expression`);

  const agents: Record<string, AgentDef> = {};
  if (raw.agents !== undefined && !isRecord(raw.agents)) errors.push("agents must be a map of agent name → definition");
  for (const [name, def] of Object.entries(isRecord(raw.agents) ? raw.agents : {})) {
    const agent = checkAgent(name, def, ctx, errors);
    if (agent) agents[name] = agent;
  }

  const task: TaskDef = { slug, name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : slug, schedule, agents, steps: [] };
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) errors.push("steps must be a non-empty list");
  for (const [i, s] of (Array.isArray(raw.steps) ? raw.steps : []).entries()) {
    const step = checkStep(i, s, task, scripts, errors);
    if (step) task.steps.push(step);
  }
  return errors.length > 0 ? { slug, errors } : { slug, task, errors };
}

/** Every `tasks/*.yaml`, valid or not, by slug. */
export function listTaskFiles(): TaskFile[] {
  const dir = at("tasks");
  if (!existsSync(/* turbopackIgnore: true */ dir)) return [];
  return readdirSync(/* turbopackIgnore: true */ dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => loadTask(f.slice(0, -".yaml".length)))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
