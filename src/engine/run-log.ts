import { randomUUID } from "node:crypto";
import { getLogsDb } from "./db.ts";

export type RunStatus = "pending" | "running" | "completed" | "failed" | "interrupted";

export interface Run {
  id: string;
  taskId: string;
  status: RunStatus;
  output: string;
  errorMessage: string | null;
  startedAt: string;
  endedAt: string | null;
}

interface RunRow {
  id: string;
  task_id: string;
  status: string;
  output: string;
  error_message: string | null;
  started_at: string;
  ended_at: string | null;
}

function runFromRow(row: RunRow): Run {
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status as RunStatus,
    output: row.output,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export function createRun(taskId: string): Run {
  const id = randomUUID();
  const now = new Date().toISOString();
  getLogsDb()
    .prepare(`INSERT INTO runs (id, task_id, status, output, error_message, started_at, ended_at) VALUES (?, ?, 'pending', '', NULL, ?, NULL)`)
    .run(id, taskId, now);
  return getRun(id)!;
}

export function getRun(id: string): Run | undefined {
  const row = getLogsDb().prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
  return row ? runFromRow(row) : undefined;
}

export function listRuns(taskId: string): Run[] {
  const rows = getLogsDb()
    .prepare("SELECT * FROM runs WHERE task_id = ? ORDER BY started_at DESC")
    .all(taskId) as RunRow[];
  return rows.map(runFromRow);
}

export function updateRunStatus(id: string, status: RunStatus, opts?: { errorMessage?: string }): void {
  const ended = status === "completed" || status === "failed" || status === "interrupted";
  getLogsDb()
    .prepare(
      `UPDATE runs SET status = ?, error_message = COALESCE(?, error_message), ended_at = CASE WHEN ? THEN ? ELSE ended_at END WHERE id = ?`,
    )
    .run(status, opts?.errorMessage ?? null, ended ? 1 : 0, new Date().toISOString(), id);
}

export function appendRunOutput(id: string, chunk: string): void {
  getLogsDb().prepare("UPDATE runs SET output = output || ? WHERE id = ?").run(chunk, id);
}

export function markStaleRunsInterrupted(): number {
  const result = getLogsDb()
    .prepare(`UPDATE runs SET status = 'interrupted', ended_at = ? WHERE status IN ('pending', 'running')`)
    .run(new Date().toISOString());
  return result.changes;
}
