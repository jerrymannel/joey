"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { api } from "../lib/api.ts";
import type { TaskSummary } from "../lib/types.ts";
import { when } from "../lib/format.ts";
import DataGrid from "../components/DataGrid.tsx";

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
  { field: "name", headerName: "Name", flex: 2 },
  { field: "slug", headerName: "File", valueFormatter: (p) => `tasks/${p.value}.yaml`, flex: 2 },
  { field: "schedule", headerName: "Schedule", valueFormatter: (p) => p.value ?? "manual" },
  { headerName: "State", cellRenderer: State, sortable: false },
  { headerName: "Last run", cellRenderer: LastRun, flex: 2, sortable: false },
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
      </div>
      <p className="muted">
        A task is a <code>tasks/&lt;name&gt;.yaml</code> file of script and agent steps, edited by hand — see <code>docs/redesign.md</code>. Changes apply to the next run.
      </p>

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
