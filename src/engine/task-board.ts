import { randomUUID } from "node:crypto";
import { getDataDb } from "./db.ts";

/** "adk" is TypeScript-based and not wired up to actually run yet — see harness.ts. */
export const HARNESSES = ["pi", "claude", "agy", "adk"] as const;
export type Harness = (typeof HARNESSES)[number];

export interface Task {
  id: string;
  name: string;
  folderPath: string;
  prompt: string;
  harness: Harness;
  cliParams: string;
  model: string;
  schedule: string | null;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listTasks(): Task[] {
  const rows = getDataDb().prepare("SELECT * FROM tasks ORDER BY created_at DESC").all() as TaskRow[];
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

export function createTask(input: { name: string; folderPath: string }): Task {
  const now = new Date().toISOString();
  const id = randomUUID();
  getDataDb()
    .prepare(
      `INSERT INTO tasks (id, name, folder_path, prompt, harness, cli_params, model, schedule, created_at, updated_at)
       VALUES (?, ?, ?, '', 'pi', '', '', NULL, ?, ?)`,
    )
    .run(id, input.name, input.folderPath, now, now);
  return getTask(id)!;
}

export function updateTask(
  id: string,
  patch: Partial<{
    name: string;
    prompt: string;
    harness: Harness;
    cliParams: string;
    model: string;
    schedule: string | null;
  }>,
): Task | undefined {
  const existing = getTask(id);
  if (!existing) return undefined;
  if (patch.harness && !HARNESSES.includes(patch.harness)) {
    throw new Error(`harness must be one of ${HARNESSES.join(", ")}`);
  }
  const next = { ...existing, ...patch };
  getDataDb()
    .prepare(
      `UPDATE tasks SET name = ?, prompt = ?, harness = ?, cli_params = ?, model = ?, schedule = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(next.name, next.prompt, next.harness, next.cliParams, next.model, next.schedule, new Date().toISOString(), id);
  return getTask(id);
}

export function deleteTask(id: string): void {
  getDataDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}
