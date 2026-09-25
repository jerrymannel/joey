"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { api } from "../lib/api.ts";
import type { TaskRun } from "../lib/types.ts";
import { duration, when } from "../lib/format.ts";
import DataGrid from "../components/DataGrid.tsx";

type Row = Omit<TaskRun, "log">;

function Status(p: ICellRendererParams<Row>) {
  return p.data ? <span className={`badge badge-${p.data.status}`}>{p.data.status}</span> : null;
}

const COLUMNS: ColDef<Row>[] = [
  { field: "taskSlug", headerName: "Task", flex: 2 },
  { field: "startedAt", headerName: "Started", valueFormatter: (p) => when(p.value), flex: 2, minWidth: 200, sort: "desc" },
  { headerName: "Took", valueGetter: (p) => (p.data ? duration(p.data.startedAt, p.data.endedAt) : ""), sortable: false, minWidth: 90 },
  { field: "status", headerName: "Status", cellRenderer: Status, minWidth: 140 },
  { field: "errorMessage", headerName: "Error", flex: 3, valueFormatter: (p) => p.value ?? "" },
];

export default function RunsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => api.get<Row[]>("/api/runs").then(setRuns).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Runs</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {runs === null ? (
        <p className="muted">Loading…</p>
      ) : runs.length === 0 ? (
        <div className="empty-state">No runs yet — start one from a task.</div>
      ) : (
        <DataGrid<Row> columnDefs={COLUMNS} rowData={runs} onRowClicked={(r) => router.push(`/runs/${r.id}`)} />
      )}
    </>
  );
}
