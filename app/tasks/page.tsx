"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ColDef, ICellRendererParams, ValueGetterParams } from "ag-grid-community";
import { api } from "../lib/api.ts";
import type { TaskSummary } from "../lib/types.ts";
import { when } from "../lib/format.ts";
import DataGrid from "../components/DataGrid.tsx";

const stateOf = (t: TaskSummary) => (!t.valid ? "has errors" : t.paused ? "paused" : "ready");

function Name(p: ICellRendererParams<TaskSummary>) {
  if (!p.data) return null;
  return <Link href={`/tasks/${p.data.slug}`}>{p.data.name}</Link>;
}

function State(p: ICellRendererParams<TaskSummary>) {
  if (!p.data) return null;
  if (!p.data.valid) return <span className="badge badge-invalid">has errors</span>;
  return p.data.paused ? <span className="badge badge-paused">paused</span> : <span className="muted">ready</span>;
}

function LastRun(p: ICellRendererParams<TaskSummary>) {
  const run = p.data?.lastRun;
  if (!run) return <span className="muted">never run</span>;
  return (
    <span>
      <span className={`badge badge-${run.status}`}>{run.status}</span> <span className="muted">{when(run.startedAt)}</span>
    </span>
  );
}

const COLUMNS: ColDef<TaskSummary>[] = [
  { field: "name", headerName: "Name", cellRenderer: Name, flex: 2 },
  { field: "slug", headerName: "File", valueFormatter: (p) => `tasks/${p.value}.yaml`, flex: 2 },
  { field: "schedule", headerName: "Schedule", valueFormatter: (p) => p.value ?? "manual" },
  { headerName: "State", cellRenderer: State, valueGetter: (p: ValueGetterParams<TaskSummary>) => (p.data ? stateOf(p.data) : "") },
  { headerName: "Last run", cellRenderer: LastRun, flex: 2, valueGetter: (p: ValueGetterParams<TaskSummary>) => p.data?.lastRun?.startedAt ?? "" },
];

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<TaskSummary[]>("/api/tasks").then(setTasks).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Tasks</h1>
        <button type="button" onClick={() => router.push("/tasks/new")}>New task</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {tasks === null ? (
        <p className="muted">Loading…</p>
      ) : tasks.length === 0 ? (
        <div className="empty-state">No task files yet — add one to the tasks/ folder.</div>
      ) : (
        <DataGrid<TaskSummary> columnDefs={COLUMNS} rowData={tasks} onRowClicked={(t) => router.push(`/tasks/${t.slug}`)} />
      )}
    </>
  );
}
