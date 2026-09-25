"use client";

import { useEffect, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { api } from "../../lib/api.ts";
import type { ToolDef } from "../../lib/types.ts";
import DataGrid from "../../components/DataGrid.tsx";

const COLUMNS: ColDef<ToolDef>[] = [
  { field: "service", headerName: "Service", maxWidth: 120 },
  { field: "name", headerName: "Name", flex: 1 },
  { field: "description", headerName: "Description", flex: 2 },
];

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ToolDef[]>("/api/tools").then(setTools).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Tools</h1>
      </div>
      <p className="muted">
        Joey's own tools for agents, defined in code (pi-tools/). An agent lists the ones it gets under <code>tools:</code> in its task file; the task_* tools are always on.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {tools === null ? (
        <p className="muted">Loading…</p>
      ) : tools.length === 0 ? (
        <div className="empty-state">No tools.</div>
      ) : (
        <DataGrid<ToolDef> columnDefs={COLUMNS} rowData={tools} />
      )}
    </>
  );
}
