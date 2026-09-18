import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDb } from "./db.ts";
import { getWorkspaceFolder } from "./settings.ts";

/** "adk" is TypeScript-based and not wired up to actually run yet — see harness.ts. */
export const HARNESSES = ["pi", "claude", "agy", "adk"] as const;
export type Harness = (typeof HARNESSES)[number];

/** "generic" tasks show up only on the Tasks page; gmail/youtube ones are automations scoped to that service's page. */
export const TASK_SERVICES = ["generic", "gmail", "youtube"] as const;
export type TaskService = (typeof TASK_SERVICES)[number];

/** pi-only option — see harness.ts's buildArgs. Exact accepted values pending confirmation against pi's real CLI. */
export const THINKING_LEVELS = ["low", "medium", "high"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface Task {
  id: string;
  name: string;
  folderPath: string;
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
  harness: string;
  cli_params: string;
  model: string;
  schedule: string | null;
  service: string;
  tool_ids: string;
  search_query: string;
  playlist_id: string;
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
    prompt: row.prompt,
    harness: row.harness as Harness,
    cliParams: row.cli_params,
    model: row.model,
    schedule: row.schedule,
    service: row.service as TaskService,
    toolIds: JSON.parse(row.tool_ids),
    searchQuery: row.search_query,
    playlistId: row.playlist_id,
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

export function getTaskByFolder(folderPath: string): Task | undefined {
  const row = getDataDb().prepare("SELECT * FROM tasks WHERE folder_path = ?").get(folderPath) as
    | TaskRow
    | undefined;
  return row ? taskFromRow(row) : undefined;
}

/** Gmail/youtube automations don't take a folderPath from the caller — they get one derived from the general workspace folder setting plus their own (dash-free) id, created here. */
export function createTask(input: {
  name: string;
  folderPath?: string;
  service?: TaskService;
  prompt?: string;
  harness?: Harness;
  cliParams?: string;
  model?: string;
  schedule?: string | null;
  toolIds?: string[];
  searchQuery?: string;
  playlistId?: string;
  thinkingLevel?: string;
  trustFolder?: boolean;
}): Task {
  const now = new Date().toISOString();
  const id = randomUUID().replace(/-/g, "");
  const service = input.service ?? "generic";

  let folderPath = input.folderPath;
  if (service === "gmail" || service === "youtube") {
    const workspace = getWorkspaceFolder();
    if (!workspace) throw new Error("Set a workspace folder in Settings → General first");
    folderPath = join(workspace, id);
    mkdirSync(folderPath, { recursive: true });
  }
  if (!folderPath) throw new Error("folderPath is required");

  getDataDb()
    .prepare(
      `INSERT INTO tasks (id, name, folder_path, prompt, harness, cli_params, model, schedule, service, tool_ids, search_query, playlist_id, thinking_level, trust_folder, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      folderPath,
      input.prompt ?? "",
      input.harness ?? "pi",
      input.cliParams ?? "",
      input.model ?? "",
      input.schedule ?? null,
      service,
      JSON.stringify(input.toolIds ?? []),
      input.searchQuery ?? "",
      input.playlistId ?? "",
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
    prompt: string;
    harness: Harness;
    cliParams: string;
    model: string;
    schedule: string | null;
    toolIds: string[];
    searchQuery: string;
    playlistId: string;
    thinkingLevel: string;
    trustFolder: boolean;
  }>,
): Task | undefined {
  const existing = getTask(id);
  if (!existing) return undefined;
  if (patch.harness && !HARNESSES.includes(patch.harness)) {
    throw new Error(`harness must be one of ${HARNESSES.join(", ")}`);
  }
  if (patch.folderPath) {
    const clash = getTaskByFolder(patch.folderPath);
    if (clash && clash.id !== id) throw new Error("a task for this folder already exists");
  }
  const next = { ...existing, ...patch };
  getDataDb()
    .prepare(
      `UPDATE tasks SET name = ?, folder_path = ?, prompt = ?, harness = ?, cli_params = ?, model = ?, schedule = ?, tool_ids = ?, search_query = ?, playlist_id = ?, thinking_level = ?, trust_folder = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      next.name,
      next.folderPath,
      next.prompt,
      next.harness,
      next.cliParams,
      next.model,
      next.schedule,
      JSON.stringify(next.toolIds),
      next.searchQuery,
      next.playlistId,
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
