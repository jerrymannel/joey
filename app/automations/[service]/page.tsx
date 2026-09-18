"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { api } from "../../lib/api.ts";
import type { Run, Task } from "../../lib/types.ts";
import DataGrid from "../../components/DataGrid.tsx";

interface Row {
  id: string;
  name: string;
  schedule: string;
  model: string;
  lastStatus: string;
}

function StatusBadge(p: ICellRendererParams<Row>) {
  if (!p.data) return null;
  if (p.data.lastStatus === "never run") return <span className="muted">never run</span>;
  return <span className={`badge badge-${p.data.lastStatus}`}>{p.data.lastStatus}</span>;
}

const COLUMNS: ColDef<Row>[] = [
  { field: "name", headerName: "Name", flex: 2 },
  { field: "schedule", headerName: "Schedule" },
  { field: "model", headerName: "Model" },
  { field: "lastStatus", headerName: "Last run", cellRenderer: StatusBadge },
];

export default function AutomationsListPage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = usePromise(params);
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Task[]>(`/api/tasks?service=${service}`)
      .then(async (tasks) => {
        const rows = await Promise.all(
          tasks.map(async (t) => {
            const runs = await api.get<Run[]>(`/api/tasks/${t.id}/runs`).catch(() => []);
            return { id: t.id, name: t.name, schedule: t.schedule ?? "manual", model: t.model || "default", lastStatus: runs[0]?.status ?? "never run" };
          }),
        );
        setRows(rows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [service]);

  const title = service === "gmail" ? "Gmail automations" : "YouTube automations";

  return (
    <>
      <div className="page-header">
        <h1>{title}</h1>
        <button type="button" onClick={() => router.push(`/automations/${service}/new`)}>
          + New automation
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="empty-state">No automations yet — create one above.</div>
      ) : (
        <DataGrid<Row> columnDefs={COLUMNS} rowData={rows} onRowClicked={(row) => router.push(`/automations/${service}/${row.id}`)} />
      )}
    </>
  );
}
