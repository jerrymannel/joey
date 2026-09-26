import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse } from "yaml";
import { cronIsValid } from "./cron.ts";

/**
 * The hand-edited definitions Joey runs (docs/redesign.md): `tasks/<slug>.yaml`, `scripts/<name>/config.yaml`, `prompts/<name>.md`
 * and `mcp.json`, all under JOEY_HOME (default: the repo, i.e. cwd). Read on every call — an edit applies to the next run.
 */
export function joeyHome(): string {
  return resolve(/* turbopackIgnore: true */ process.env.JOEY_HOME ?? process.cwd());
}
const at = (...parts: string[]) => join(/* turbopackIgnore: true */ joeyHome(), ...parts);

export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_MAX_ROUNDS = 3;

/** An agent step's agent, defined inline: just a model (+ optional thinking). It gets every tool, every MCP server and every skill. */
export interface AgentDef {
  model: string;
  thinking: string;
}

export type StepDef =
  | { kind: "script"; script: string; params: Record<string, unknown>; timeoutMs: number }
  /**
   * The agent's `instructions` are either inline (`instructions`) or a file in prompts/ (`instructionsFile`) — exactly one.
   * `reviews` is the 0-based index of the earlier agent step this one reviews.
   */
  | { kind: "agent"; agent: AgentDef; instructions: string; instructionsFile?: string; reviews?: number; maxRounds: number; timeoutMs: number };

/** A short, readable id for an agent step, used for tab labels and session folders: its instructionsFile name, or just "agent" when inline. */
export function agentLabel(step: Extract<StepDef, { kind: "agent" }>): string {
  return step.instructionsFile ? basename(step.instructionsFile).replace(/\.md$/, "") : "agent";
}

export interface TaskDef {
  slug: string;
  name: string;
  schedule: string | null;
  steps: StepDef[];
}

export interface ScriptParam {
  description: string;
  required: boolean;
  /** A UI hint for the New task form's dropdowns: "gmail-account", "youtube-account" or "youtube-playlist". Engine ignores it. */
  source: string;
}

export interface ScriptDef {
  name: string;
  /** Relative to JOEY_HOME (`scripts/<name>/<command>`); `.ts` runs with tsx, anything else is executed directly. */
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

/** A task file name (without .yaml): lowercase letters, digits, dashes — so a slug from a URL can't point outside tasks/. */
export function isTaskSlug(slug: string): boolean {
  return SLUG.test(slug);
}
const THINKING = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

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

/** `tasks/<slug>.yaml` under JOEY_HOME — only meaningful for a slug that passed `loadTask`'s name check. */
export function taskPath(slug: string): string {
  return at("tasks", `${slug}.yaml`);
}

export function promptPath(file: string): string {
  return at("prompts", file);
}

export function listPrompts(): string[] {
  const dir = at("prompts");
  return existsSync(/* turbopackIgnore: true */ dir) ? readdirSync(/* turbopackIgnore: true */ dir).filter((f) => f.endsWith(".md")).sort() : [];
}

/**
 * The skills every agent gets, as absolute paths to pass to pi's `--skill`: each immediate entry of `skills/` under JOEY_HOME
 * (a skill folder with its SKILL.md, or a loose skill file). Absent folder => none.
 */
export function listSkills(): string[] {
  const dir = at("skills");
  if (!existsSync(/* turbopackIgnore: true */ dir)) return [];
  return readdirSync(/* turbopackIgnore: true */ dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(".") && e.name !== "README.md")
    .map((e) => join(dir, e.name))
    .sort();
}

/** A model an agent can use: a plain string is a pi `provider/id`; a local model is a name + an OpenAI-compatible endpoint (registered with pi at run time). */
export interface Model {
  name: string;
  endpoint?: string;
}

/** `models.yaml` under JOEY_HOME (`{ models: [ "provider/id" | { name, endpoint } ] }`) — the pick-list the New task form offers. Absent or malformed => none. */
export function loadModels(): Model[] {
  const path = at("models.yaml");
  if (!existsSync(/* turbopackIgnore: true */ path)) return [];
  const list = (parse(readFileSync(/* turbopackIgnore: true */ path, "utf8")) as { models?: unknown })?.models;
  if (!Array.isArray(list)) return [];
  return list
    .map((m): Model | undefined => {
      if (typeof m === "string") return { name: m };
      if (isRecord(m) && typeof m.name === "string" && typeof m.endpoint === "string") return { name: m.name, endpoint: m.endpoint };
      return undefined;
    })
    .filter((m): m is Model => m !== undefined);
}

/**
 * A script is a folder `scripts/<name>/` with a `config.yaml` (its `command` — default `app.ts` — plus `description` and `params`).
 * A folder without a config.yaml isn't a script (e.g. the shared `scripts/joey.ts` lives loose, not in a folder of its own).
 */
export function loadScripts(): { scripts: Record<string, ScriptDef>; errors: string[] } {
  const dir = at("scripts");
  if (!existsSync(/* turbopackIgnore: true */ dir)) return { scripts: {}, errors: [] };
  const scripts: Record<string, ScriptDef> = {};
  const errors: string[] = [];
  for (const entry of readdirSync(/* turbopackIgnore: true */ dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const configPath = join(dir, name, "config.yaml");
    if (!existsSync(/* turbopackIgnore: true */ configPath)) continue;
    const where = `scripts/${name}/config.yaml`;
    let def: unknown;
    try {
      def = readYaml(configPath) ?? {};
    } catch (err) {
      errors.push(`${where}: ${(err as Error).message}`);
      continue;
    }
    if (!isRecord(def)) {
      errors.push(`${where}: must be a map with command, description and params`);
      continue;
    }
    const command = typeof def.command === "string" && def.command ? def.command : "app.ts";
    const rel = join("scripts", name, command);
    if (!existsSync(/* turbopackIgnore: true */ at(rel))) errors.push(`${where}: ${command} not found`);
    const params: Record<string, ScriptParam> = {};
    for (const [p, spec] of Object.entries(isRecord(def.params) ? def.params : {})) {
      const s = isRecord(spec) ? spec : {};
      params[p] = { description: typeof s.description === "string" ? s.description : "", required: s.required === true, source: typeof s.source === "string" ? s.source : "" };
    }
    scripts[name] = { name, command: rel, description: typeof def.description === "string" ? def.description : "", params };
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

/** The inline agent on an agent step: a model, with an optional thinking level. */
function checkAgentDef(where: string, raw: unknown, errors: string[]): AgentDef {
  const r = isRecord(raw) ? raw : {};
  const agent: AgentDef = {
    model: typeof r.model === "string" ? r.model : "",
    thinking: typeof r.thinking === "string" ? r.thinking : "",
  };
  if (!isRecord(raw)) errors.push(`${where}: agent must be a map with a model`);
  // ponytail: the model isn't checked against `pi --list-models` (seconds per call); a wrong one fails the run's first agent step.
  if (!agent.model) errors.push(`${where}: agent needs a model (pi's provider/id)`);
  if (agent.thinking && !THINKING.includes(agent.thinking)) errors.push(`${where}: thinking must be one of ${THINKING.join(", ")}`);
  return agent;
}

function checkStep(i: number, raw: unknown, task: { steps: StepDef[] }, scripts: Record<string, ScriptDef>, errors: string[]): StepDef | undefined {
  const where = `step ${i + 1}`;
  if (!isRecord(raw)) return void errors.push(`${where}: must be a map`);
  const timeoutMs = parseTimeout(raw.timeout);
  if (timeoutMs === null) errors.push(`${where}: timeout must look like 90s, 30m or 2h`);
  const isScript = typeof raw.script === "string";
  if (isScript === (raw.agent !== undefined)) return void errors.push(`${where}: needs exactly one of script or agent`);

  if (typeof raw.script === "string") {
    const script = scripts[raw.script];
    const params = isRecord(raw.params) ? raw.params : {};
    if (raw.params !== undefined && !isRecord(raw.params)) errors.push(`${where}: params must be a map`);
    if (!script) errors.push(`${where}: script ${raw.script} has no scripts/${raw.script}/config.yaml`);
    else {
      for (const p of Object.keys(params)) if (!script.params[p]) errors.push(`${where}: script ${raw.script} has no param ${p}`);
      for (const [p, spec] of Object.entries(script.params)) if (spec.required && params[p] === undefined) errors.push(`${where}: script ${raw.script} needs param ${p}`);
    }
    return { kind: "script", script: raw.script, params, timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS };
  }

  const agent = checkAgentDef(where, raw.agent, errors);
  const inline = typeof raw.instructions === "string" && raw.instructions.trim() ? raw.instructions : "";
  const file = typeof raw.instructionsFile === "string" && raw.instructionsFile ? raw.instructionsFile : "";
  if (!!inline === !!file) errors.push(`${where}: needs exactly one of instructions or instructionsFile (a file in prompts/)`);
  else if (file && !existsSync(/* turbopackIgnore: true */ promptPath(file))) errors.push(`${where}: prompts/${file} not found`);
  const step: StepDef = { kind: "agent", agent, instructions: inline, instructionsFile: file || undefined, maxRounds: DEFAULT_MAX_ROUNDS, timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS };
  if (raw.reviews !== undefined) {
    const n = raw.reviews;
    const target = typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= i ? task.steps[n - 1] : undefined;
    if (!target || target.kind !== "agent") errors.push(`${where}: reviews must be the number of an earlier agent step`);
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
  const path = taskPath(slug);
  if (!SLUG.test(slug)) return { slug, errors: [`"${slug}" isn't a valid task file name (lowercase letters, digits, dashes)`] };
  if (!existsSync(/* turbopackIgnore: true */ path)) return { slug, errors: [`tasks/${slug}.yaml not found`] };
  let raw: unknown;
  try {
    raw = readYaml(path);
  } catch (err) {
    return { slug, errors: [(err as Error).message] };
  }
  if (!isRecord(raw)) return { slug, errors: ["the file must be a map with a name and steps"] };

  const errors: string[] = [];
  const { scripts, errors: scriptErrors } = loadScripts();
  const { errors: mcpErrors } = loadMcpServers();
  errors.push(...scriptErrors, ...mcpErrors);

  const schedule = raw.schedule === undefined || raw.schedule === null || raw.schedule === "" ? null : String(raw.schedule);
  if (schedule !== null && !cronIsValid(schedule)) errors.push(`schedule "${schedule}" isn't a 5-field cron expression`);

  const task: TaskDef = { slug, name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : slug, schedule, steps: [] };
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
