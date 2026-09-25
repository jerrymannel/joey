import { randomUUID } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getDataDb } from "./db.ts";
import { getWorkspaceFolder } from "./settings.ts";
import { getPrompt } from "./prompts.ts";

/** "adk" is TypeScript-based and not wired up to actually run yet — see harness.ts. */
export const HARNESSES = ["pi", "claude", "agy", "adk"] as const;
export type Harness = (typeof HARNESSES)[number];

/** "generic" tasks show up only on the Tasks page; gmail/youtube/transcription ones are automations scoped to that service's page. */
export const TASK_SERVICES = ["generic", "gmail", "youtube", "transcription"] as const;
export type TaskService = (typeof TASK_SERVICES)[number];

/** pi-only option — see harness.ts's buildArgs. Exact accepted values pending confirmation against pi's real CLI. */
export const THINKING_LEVELS = ["low", "medium", "high"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface Task {
  id: string;
  name: string;
  folderPath: string;
  /** The Configurations → Prompts row this task's prompt comes from; empty for automations and for tasks from before prompts were picked from that list. */
  promptId: string;
  /** The effective prompt text: the chosen prompt's current content, else the task's legacy free-text prompt. Read-only — edit it by changing `promptId`. */
  prompt: string;
  harness: Harness;
  cliParams: string;
  model: string;
  schedule: string | null;
  service: TaskService;
  toolIds: string[];
  /** Gmail automations run against mail matching this Gmail search query; unused by other services. */
  searchQuery: string;
  /** The YouTube playlist a youtube automation downloads from; unused by other services. */
  playlistId: string;
  /** The file extensions a transcription automation transcribes, lowercase without dots, comma-separated (`mp3,wav`); unused by other services. */
  extensions: string;
  /** A youtube automation transcribes each video's audio.mp3 (whisper) once it has downloaded — on unless created with `transcribe: false`; unused by other services. */
  transcribe: boolean;
  /** The connected Google account (email) a gmail/youtube automation runs as; empty = the first connected one. Unused by plain tasks. */
  account: string;
  /** pi-only: reasoning effort passed via --thinking. Empty means pi's own default. */
  thinkingLevel: string;
  /** pi-only: whether to pass the flag that trusts/auto-approves this task's folder instead of prompting. */
  trustFolder: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TaskRow {
  id: string;
  name: string;
  folder_path: string;
  prompt: string;
  prompt_id: string;
  harness: string;
  cli_params: string;
  model: string;
  schedule: string | null;
  service: string;
  tool_ids: string;
  search_query: string;
  playlist_id: string;
  extensions: string;
  transcribe: number;
  account: string;
  thinking_level: string;
  trust_folder: number;
  created_at: string;
  updated_at: string;
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    name: row.name,
    folderPath: row.folder_path,
    promptId: row.prompt_id,
    prompt: getPrompt(row.prompt_id)?.content ?? row.prompt,
    harness: row.harness as Harness,
    cliParams: row.cli_params,
    model: row.model,
    schedule: row.schedule,
    service: row.service as TaskService,
    toolIds: JSON.parse(row.tool_ids),
    searchQuery: row.search_query,
    playlistId: row.playlist_id,
    extensions: row.extensions,
    transcribe: row.transcribe === 1,
    account: row.account,
    thinkingLevel: row.thinking_level,
    trustFolder: row.trust_folder === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listTasks(service?: TaskService): Task[] {
  const rows = (
    service
      ? getDataDb().prepare("SELECT * FROM tasks WHERE service = ? ORDER BY created_at DESC").all(service)
      : getDataDb().prepare("SELECT * FROM tasks ORDER BY created_at DESC").all()
  ) as TaskRow[];
  return rows.map(taskFromRow);
}

export function getTask(id: string): Task | undefined {
  const row = getDataDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  return row ? taskFromRow(row) : undefined;
}

/** The task that owns `folderPath`. A transcription automation only reads its folder, so it never counts as owning it. */
export function getTaskByFolder(folderPath: string): Task | undefined {
  const row = getDataDb().prepare("SELECT * FROM tasks WHERE folder_path = ? AND service != 'transcription'").get(folderPath) as
    | TaskRow
    | undefined;
  return row ? taskFromRow(row) : undefined;
}

/** "MP3, .wav *.M4A" → "mp3,wav,m4a": what a transcription automation stores and matches on. */
export function normalizeExtensions(raw: string): string {
  return [...new Set(raw.split(/[\s,]+/).map((e) => e.replace(/^\*?\./, "").toLowerCase()).filter(Boolean))].join(",");
}

/** A transcription automation's folder is one the user picked, so it has to exist already, and it needs something to match. */
function checkTranscriptionInput(folderPath: string, extensions: string): void {
  if (!statSync(folderPath, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`folder not found: ${folderPath}`);
  if (!extensions) throw new Error("at least one file extension is required");
}

/**
 * Gmail/youtube automations don't take a folderPath from the caller — they always get one derived from the
 * general workspace folder setting plus their own (dash-free) id, created here. A plain generic task gets the
 * same default only when it doesn't supply its own folderPath (so it can still point at an existing project).
 */
export function createTask(input: {
  name: string;
  folderPath?: string;
  service?: TaskService;
  promptId?: string;
  harness?: Harness;
  cliParams?: string;
  model?: string;
  schedule?: string | null;
  toolIds?: string[];
  searchQuery?: string;
  playlistId?: string;
  extensions?: string;
  transcribe?: boolean;
  account?: string;
  thinkingLevel?: string;
  trustFolder?: boolean;
}): Task {
  const now = new Date().toISOString();
  const id = randomUUID().replace(/-/g, "");
  const service = input.service ?? "generic";

  let folderPath = input.folderPath;
  if (service === "gmail" || service === "youtube" || (service === "generic" && !folderPath)) {
    const workspace = getWorkspaceFolder();
    if (!workspace) throw new Error("Set a workspace folder in Settings → General first");
    folderPath = join(workspace, id);
    mkdirSync(folderPath, { recursive: true });
  }
  if (!folderPath) throw new Error("folderPath is required");
  const extensions = normalizeExtensions(input.extensions ?? "");
  if (service === "transcription") checkTranscriptionInput(folderPath, extensions);

  getDataDb()
    .prepare(
      `INSERT INTO tasks (id, name, folder_path, prompt_id, harness, cli_params, model, schedule, service, tool_ids, search_query, playlist_id, extensions, transcribe, account, thinking_level, trust_folder, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      folderPath,
      input.promptId ?? "",
      input.harness ?? "pi",
      input.cliParams ?? "",
      input.model ?? "",
      input.schedule ?? null,
      service,
      JSON.stringify(input.toolIds ?? []),
      input.searchQuery ?? "",
      input.playlistId ?? "",
      extensions,
      (input.transcribe ?? service === "youtube") ? 1 : 0,
      input.account ?? "",
      input.thinkingLevel ?? "",
      input.trustFolder ? 1 : 0,
      now,
      now,
    );
  return getTask(id)!;
}

export function updateTask(
  id: string,
  patch: Partial<{
    name: string;
    folderPath: string;
    promptId: string;
    harness: Harness;
    cliParams: string;
    model: string;
    schedule: string | null;
    toolIds: string[];
    searchQuery: string;
    playlistId: string;
    extensions: string;
    transcribe: boolean;
    account: string;
    thinkingLevel: string;
    trustFolder: boolean;
  }>,
): Task | undefined {
  const existing = getTask(id);
  if (!existing) return undefined;
  if (patch.harness && !HARNESSES.includes(patch.harness)) {
    throw new Error(`harness must be one of ${HARNESSES.join(", ")}`);
  }
  if (patch.folderPath && existing.service !== "transcription") {
    const clash = getTaskByFolder(patch.folderPath);
    if (clash && clash.id !== id) throw new Error("a task for this folder already exists");
  }
  const next = { ...existing, ...patch };
  if (patch.extensions !== undefined) next.extensions = normalizeExtensions(patch.extensions);
  if (existing.service === "transcription") checkTranscriptionInput(next.folderPath, next.extensions);
  getDataDb()
    .prepare(
      `UPDATE tasks SET name = ?, folder_path = ?, prompt_id = ?, harness = ?, cli_params = ?, model = ?, schedule = ?, tool_ids = ?, search_query = ?, playlist_id = ?, extensions = ?, transcribe = ?, account = ?, thinking_level = ?, trust_folder = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      next.name,
      next.folderPath,
      next.promptId,
      next.harness,
      next.cliParams,
      next.model,
      next.schedule,
      JSON.stringify(next.toolIds),
      next.searchQuery,
      next.playlistId,
      next.extensions,
      next.transcribe ? 1 : 0,
      next.account,
      next.thinkingLevel,
      next.trustFolder ? 1 : 0,
      new Date().toISOString(),
      id,
    );
  return getTask(id);
}

export function deleteTask(id: string): void {
  getDataDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}
