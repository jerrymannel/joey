"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { api } from "../lib/api.ts";
import type { Run, Task } from "../lib/types.ts";
import DataGrid from "../components/DataGrid.tsx";

interface Row {
  id: string;
  name: string;
  folderPath: string;
  harness: string;
  lastStatus: string;
}

function StatusBadge(p: ICellRendererParams<Row>) {
  if (!p.data) return null;
  if (p.data.lastStatus === "never run") return <span className="muted">never run</span>;
  return <span className={`badge badge-${p.data.lastStatus}`}>{p.data.lastStatus}</span>;
}

const COLUMNS: ColDef<Row>[] = [
  { field: "name", headerName: "Name", flex: 2 },
  { field: "folderPath", headerName: "Folder", flex: 2 },
  { field: "harness", headerName: "Harness" },
  { field: "lastStatus", headerName: "Last run", cellRenderer: StatusBadge },
];

export default function TasksPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Task[]>("/api/tasks?service=generic")
      .then(async (tasks) => {
        const rows = await Promise.all(
          tasks.map(async (t) => {
            const runs = await api.get<Run[]>(`/api/tasks/${t.id}/runs`).catch(() => []);
            return { id: t.id, name: t.name, folderPath: t.folderPath, harness: t.harness, lastStatus: runs[0]?.status ?? "never run" };
          }),
        );
        setRows(rows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Tasks</h1>
        <button type="button" onClick={() => router.push("/tasks/new")}>
          + New task
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="empty-state">No tasks yet — create one above.</div>
      ) : (
        <DataGrid<Row> columnDefs={COLUMNS} rowData={rows} onRowClicked={(row) => router.push(`/tasks/${row.id}`)} />
      )}
    </>
  );
}
