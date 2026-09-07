import { randomUUID } from "node:crypto";
import { getLogsDb } from "./db.ts";

export type RunStatus = "pending" | "running" | "completed" | "failed" | "interrupted";
export type WorkerStatus =
  | "pending"
  | "spawning"
  | "working"
  | "idle"
  | "blocked"
  | "awaiting_review"
  | "reviewed"
  | "awaiting_merge"
  | "merged"
  | "failed";

export interface Run {
  id: string;
  taskId: string;
  herdrWorkspaceId: string | null;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
}

export interface Worker {
  id: string;
  runId: string;
  roleId: string;
  roleName: string;
  worktreePath: string | null;
  branchName: string | null;
  herdrPaneId: string | null;
  status: WorkerStatus;
  artifactSuccess: boolean | null;
  artifactMessage: string | null;
  reviewedWorkerId: string | null;
  mergeApprovedAt: string | null;
  mergedAt: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface StatusEvent {
  id: number;
  workerId: string;
  status: string;
  detail: string | null;
  occurredAt: string;
}

interface RunRow {
  id: string;
  task_id: string;
  herdr_workspace_id: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
}

interface WorkerRow {
  id: string;
  run_id: string;
  role_id: string;
  role_name: string;
  worktree_path: string | null;
  branch_name: string | null;
  herdr_pane_id: string | null;
  status: string;
  artifact_success: number | null;
  artifact_message: string | null;
  reviewed_worker_id: string | null;
  merge_approved_at: string | null;
  merged_at: string | null;
  started_at: string;
  ended_at: string | null;
}

interface StatusEventRow {
  id: number;
  worker_id: string;
  status: string;
  detail: string | null;
  occurred_at: string;
}

function runFromRow(row: RunRow): Run {
  return {
    id: row.id,
    taskId: row.task_id,
    herdrWorkspaceId: row.herdr_workspace_id,
    status: row.status as RunStatus,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function workerFromRow(row: WorkerRow): Worker {
  return {
    id: row.id,
    runId: row.run_id,
    roleId: row.role_id,
    roleName: row.role_name,
    worktreePath: row.worktree_path,
    branchName: row.branch_name,
    herdrPaneId: row.herdr_pane_id,
    status: row.status as WorkerStatus,
    artifactSuccess: row.artifact_success === null ? null : row.artifact_success === 1,
    artifactMessage: row.artifact_message,
    reviewedWorkerId: row.reviewed_worker_id,
    mergeApprovedAt: row.merge_approved_at,
    mergedAt: row.merged_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function eventFromRow(row: StatusEventRow): StatusEvent {
  return {
    id: row.id,
    workerId: row.worker_id,
    status: row.status,
    detail: row.detail,
    occurredAt: row.occurred_at,
  };
}

export function createRun(taskId: string): Run {
  const id = randomUUID();
  const now = new Date().toISOString();
  getLogsDb()
    .prepare(`INSERT INTO runs (id, task_id, herdr_workspace_id, status, started_at, ended_at) VALUES (?, ?, NULL, 'pending', ?, NULL)`)
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

export function updateRunStatus(id: string, status: RunStatus, opts?: { herdrWorkspaceId?: string }): void {
  const ended = status === "completed" || status === "failed" || status === "interrupted";
  getLogsDb()
    .prepare(
      `UPDATE runs SET status = ?, herdr_workspace_id = COALESCE(?, herdr_workspace_id), ended_at = CASE WHEN ? THEN ? ELSE ended_at END WHERE id = ?`,
    )
    .run(status, opts?.herdrWorkspaceId ?? null, ended ? 1 : 0, new Date().toISOString(), id);
}

export function markStaleRunsInterrupted(): number {
  const result = getLogsDb()
    .prepare(`UPDATE runs SET status = 'interrupted', ended_at = ? WHERE status = 'running'`)
    .run(new Date().toISOString());
  return result.changes;
}

export function createWorker(input: {
  id?: string;
  runId: string;
  roleId: string;
  roleName: string;
  worktreePath: string | null;
  branchName: string | null;
  reviewedWorkerId?: string | null;
}): Worker {
  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();
  getLogsDb()
    .prepare(
      `INSERT INTO workers (id, run_id, role_id, role_name, worktree_path, branch_name, herdr_pane_id, status, artifact_success, artifact_message, reviewed_worker_id, merge_approved_at, merged_at, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', NULL, NULL, ?, NULL, NULL, ?, NULL)`,
    )
    .run(id, input.runId, input.roleId, input.roleName, input.worktreePath, input.branchName, input.reviewedWorkerId ?? null, now);
  return getWorker(id)!;
}

export function getWorker(id: string): Worker | undefined {
  const row = getLogsDb().prepare("SELECT * FROM workers WHERE id = ?").get(id) as WorkerRow | undefined;
  return row ? workerFromRow(row) : undefined;
}

export function findReviewerFor(workerId: string): Worker | undefined {
  const row = getLogsDb()
    .prepare("SELECT * FROM workers WHERE reviewed_worker_id = ? ORDER BY started_at DESC LIMIT 1")
    .get(workerId) as WorkerRow | undefined;
  return row ? workerFromRow(row) : undefined;
}

export function listWorkers(runId: string): Worker[] {
  const rows = getLogsDb()
    .prepare("SELECT * FROM workers WHERE run_id = ? ORDER BY started_at ASC")
    .all(runId) as WorkerRow[];
  return rows.map(workerFromRow);
}

export function countActiveWorkers(runId: string): number {
  const row = getLogsDb()
    .prepare(
      `SELECT COUNT(*) as n FROM workers WHERE run_id = ? AND status IN ('spawning','working','idle')`,
    )
    .get(runId) as { n: number };
  return row.n;
}

export function setWorkerPane(id: string, herdrPaneId: string): void {
  getLogsDb().prepare("UPDATE workers SET herdr_pane_id = ? WHERE id = ?").run(herdrPaneId, id);
}

export function updateWorkerStatus(id: string, status: WorkerStatus): void {
  const ended = status === "failed" || status === "merged";
  getLogsDb()
    .prepare(
      `UPDATE workers SET status = ?, ended_at = CASE WHEN ? THEN ? ELSE ended_at END WHERE id = ?`,
    )
    .run(status, ended ? 1 : 0, new Date().toISOString(), id);
}

export function setWorkerArtifactResult(id: string, success: boolean, message: string): void {
  getLogsDb()
    .prepare("UPDATE workers SET artifact_success = ?, artifact_message = ? WHERE id = ?")
    .run(success ? 1 : 0, message, id);
}

export function approveMerge(id: string): void {
  getLogsDb()
    .prepare("UPDATE workers SET merge_approved_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

export function completeMerge(id: string): void {
  getLogsDb().prepare("UPDATE workers SET merged_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

export function addStatusEvent(workerId: string, status: string, detail?: string | null): StatusEvent {
  const result = getLogsDb()
    .prepare("INSERT INTO status_events (worker_id, status, detail, occurred_at) VALUES (?, ?, ?, ?)")
    .run(workerId, status, detail ?? null, new Date().toISOString());
  const row = getLogsDb()
    .prepare("SELECT * FROM status_events WHERE id = ?")
    .get(result.lastInsertRowid) as StatusEventRow;
  return eventFromRow(row);
}

export function latestStatusEvent(workerId: string): StatusEvent | undefined {
  const row = getLogsDb()
    .prepare("SELECT * FROM status_events WHERE worker_id = ? ORDER BY id DESC LIMIT 1")
    .get(workerId) as StatusEventRow | undefined;
  return row ? eventFromRow(row) : undefined;
}

export function listStatusEvents(workerId: string): StatusEvent[] {
  const rows = getLogsDb()
    .prepare("SELECT * FROM status_events WHERE worker_id = ? ORDER BY id ASC")
    .all(workerId) as StatusEventRow[];
  return rows.map(eventFromRow);
}
