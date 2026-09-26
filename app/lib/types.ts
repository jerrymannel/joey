// Client-facing shapes of src/engine's types, duplicated on purpose: importing the engine from a client component
// would drag server-only modules (better-sqlite3, node:fs) into the browser bundle.

export interface GeneralSettings {
  workspaceFolder: string | null;
  /** The connected Gmail account results are emailed from; null until one is connected. */
  mailAccount: string | null;
  /** The user's own address, where run results are emailed; empty until set. */
  userEmail: string;
}

export type SshAuthMethod = "password" | "identity";

/** A remote server for the ssh tools; the stored password / key never comes back from the API. */
export interface SshConfig {
  id: string;
  name: string;
  host: string;
  username: string;
  authMethod: SshAuthMethod;
  createdAt: string;
}

export type ToolService = "gmail" | "youtube" | "ssh" | "whisper" | "task";

export interface ToolDef {
  service: ToolService;
  name: string;
  description: string;
  /** Given to every agent without being listed (the task_* tools). */
  alwaysOn: boolean;
}

export interface GmailAccountStatus {
  email: string;
}

export interface GmailStatus {
  configured: boolean;
  clientId: string | null;
  accounts: GmailAccountStatus[];
}

export interface YoutubeAccountStatus {
  email: string;
}

export interface YoutubeStatus {
  configured: boolean;
  usesGmailApp: boolean;
  clientId: string | null;
  accounts: YoutubeAccountStatus[];
}

export interface TokenInfo {
  scopes: string[];
  expiresIn: number;
}

// Tasks are tasks/<slug>.yaml files (docs/redesign.md) — see src/engine/definitions.ts and task-runs.ts.

export interface AgentDef {
  name: string;
  prompt: string;
  model: string;
  thinking: string;
  tools: string[];
  mcp: string[];
}

export type StepDef =
  | { kind: "script"; script: string; params: Record<string, unknown>; timeoutMs: number }
  | { kind: "agent"; agent: string; instruction: string; instructionFile?: string; reviews?: number; maxRounds: number; timeoutMs: number };

/** A task step and the herdr + pi commands a run would issue for it (the /simulate endpoint). */
export interface SimulatedStep {
  label: string;
  commands: string[];
}

export interface Simulation {
  runDir: string;
  steps: SimulatedStep[];
  notes: string[];
}

export interface TaskDef {
  slug: string;
  name: string;
  schedule: string | null;
  agents: Record<string, AgentDef>;
  steps: StepDef[];
}

export type TaskRunStatus = "running" | "completed" | "failed" | "interrupted";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface TaskRun {
  id: string;
  taskSlug: string;
  status: TaskRunStatus;
  runDir: string;
  log: string;
  errorMessage: string | null;
  startedAt: string;
  endedAt: string | null;
}

/** A row of the Tasks list. `name` falls back to the slug when the file doesn't parse. */
export interface TaskSummary {
  slug: string;
  name: string;
  schedule: string | null;
  valid: boolean;
  paused: boolean;
  lastRun: Pick<TaskRun, "id" | "status" | "startedAt"> | null;
}

export interface TaskDetail {
  slug: string;
  /** Set only when the file validated. */
  task: TaskDef | null;
  errors: string[];
  paused: boolean;
  /** The file as written. */
  source: string;
}

export interface RunStep {
  runId: string;
  idx: number;
  label: string;
  status: StepStatus;
  note: string;
  outputFile: string;
  startedAt: string | null;
  endedAt: string | null;
  /** The step's output file, when it has one yet. */
  output: string | null;
}

export interface RunDetail {
  run: TaskRun;
  steps: RunStep[];
  /** RUN_DIR/result.md, once written. */
  result: string | null;
}

export interface ScriptParam {
  description: string;
  required: boolean;
}

export interface ScriptDef {
  name: string;
  command: string;
  description: string;
  params: Record<string, ScriptParam>;
}

export interface PromptFile {
  name: string;
  content: string;
}

/** A models.yaml entry: a plain `provider/id`, or a local model with an OpenAI-compatible endpoint. */
export interface Model {
  name: string;
  endpoint?: string;
}

/** An mcp.json server as the UI shows it: env values stay server-side, only their names come back. */
export interface McpServerSummary {
  name: string;
  command: string;
  url: string;
  envKeys: string[];
}
