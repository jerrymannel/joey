import { randomUUID } from "node:crypto";
import { getDataDb, getLogsDb } from "./db.ts";

/** Runs of yaml tasks (docs/redesign.md) and their steps; the task's own state (paused). */

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

export interface RunStep {
  runId: string;
  idx: number;
  label: string;
  status: StepStatus;
  note: string;
  outputFile: string;
  startedAt: string | null;
  endedAt: string | null;
}

const runFromRow = (r: any): TaskRun => ({
  id: r.id,
  taskSlug: r.task_slug,
  status: r.status,
  runDir: r.run_dir,
  log: r.log,
  errorMessage: r.error_message,
  startedAt: r.started_at,
  endedAt: r.ended_at,
});

const stepFromRow = (r: any): RunStep => ({
  runId: r.run_id,
  idx: r.idx,
  label: r.label,
  status: r.status,
  note: r.note,
  outputFile: r.output_file,
  startedAt: r.started_at,
  endedAt: r.ended_at,
});

const now = () => new Date().toISOString();

/** Creates the run already `running` (nothing awaits between creating and starting it, so a run can't be stuck pending) with one pending row per step. */
export function createTaskRun(taskSlug: string, runDir: string, stepLabels: string[]): TaskRun {
  const id = randomUUID().replace(/-/g, "");
  const db = getLogsDb();
  db.transaction(() => {
    db.prepare("INSERT INTO task_runs (id, task_slug, status, run_dir, started_at) VALUES (?, ?, 'running', ?, ?)").run(id, taskSlug, runDir, now());
    const insert = db.prepare("INSERT INTO run_steps (run_id, idx, label, status) VALUES (?, ?, ?, 'pending')");
    stepLabels.forEach((label, idx) => insert.run(id, idx, label));
  })();
  return getTaskRun(id)!;
}

export function getTaskRun(id: string): TaskRun | undefined {
  const row = getLogsDb().prepare("SELECT * FROM task_runs WHERE id = ?").get(id);
  return row ? runFromRow(row) : undefined;
}

/** Newest first; all tasks' runs unless `taskSlug` is given. */
export function listTaskRuns(taskSlug?: string, limit = 200): TaskRun[] {
  const rows = taskSlug
    ? getLogsDb().prepare("SELECT * FROM task_runs WHERE task_slug = ? ORDER BY started_at DESC LIMIT ?").all(taskSlug, limit)
    : getLogsDb().prepare("SELECT * FROM task_runs ORDER BY started_at DESC LIMIT ?").all(limit);
  return rows.map(runFromRow);
}

export function hasActiveRun(taskSlug: string): boolean {
  return !!getLogsDb().prepare("SELECT 1 FROM task_runs WHERE task_slug = ? AND status = 'running'").get(taskSlug);
}

export function finishTaskRun(id: string, status: Exclude<TaskRunStatus, "running">, errorMessage?: string): void {
  getLogsDb().prepare("UPDATE task_runs SET status = ?, error_message = ?, ended_at = ? WHERE id = ?").run(status, errorMessage ?? null, now(), id);
}

export function appendTaskRunLog(id: string, chunk: string): void {
  getLogsDb().prepare("UPDATE task_runs SET log = log || ? WHERE id = ?").run(chunk, id);
}

export function listRunSteps(runId: string): RunStep[] {
  return getLogsDb().prepare("SELECT * FROM run_steps WHERE run_id = ? ORDER BY idx").all(runId).map(stepFromRow);
}

export function updateRunStep(runId: string, idx: number, change: { status: StepStatus; note?: string; outputFile?: string }): void {
  const started = change.status === "running" ? now() : null;
  const ended = change.status === "completed" || change.status === "failed" ? now() : null;
  getLogsDb()
    .prepare(
      `UPDATE run_steps SET status = ?, note = COALESCE(?, note), output_file = COALESCE(?, output_file),
       started_at = COALESCE(?, started_at), ended_at = COALESCE(?, ended_at) WHERE run_id = ? AND idx = ?`,
    )
    .run(change.status, change.note ?? null, change.outputFile ?? null, started, ended, runId, idx);
}

/** Marks every step still pending as skipped (after a failure). */
export function skipPendingSteps(runId: string): void {
  getLogsDb().prepare("UPDATE run_steps SET status = 'skipped' WHERE run_id = ? AND status = 'pending'").run(runId);
}

/** At startup: a run the previous process was running can never finish. */
export function markStaleTaskRunsInterrupted(): number {
  const db = getLogsDb();
  db.prepare("UPDATE run_steps SET status = 'failed', ended_at = ? WHERE status = 'running'").run(now());
  return db.prepare("UPDATE task_runs SET status = 'interrupted', ended_at = ? WHERE status = 'running'").run(now()).changes;
}

export function isPaused(slug: string): boolean {
  const row = getDataDb().prepare("SELECT paused FROM task_state WHERE slug = ?").get(slug) as { paused: number } | undefined;
  return row?.paused === 1;
}

export function setPaused(slug: string, paused: boolean): void {
  getDataDb()
    .prepare("INSERT INTO task_state (slug, paused, updated_at) VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET paused = excluded.paused, updated_at = excluded.updated_at")
    .run(slug, paused ? 1 : 0, now());
}
