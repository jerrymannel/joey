"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [tools, setTools] = useState<ToolDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ToolDef[]>("/api/tools").then(setTools).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Tools</h1>
        <button type="button" onClick={() => router.push("/configurations/tools/new")}>
          + New tool
        </button>
      </div>
      <p className="muted">
        The tool catalog automations can be granted access to. Execution isn't wired up yet — enabled tools are
        described to the harness as context.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {tools === null ? (
        <p className="muted">Loading…</p>
      ) : tools.length === 0 ? (
        <div className="empty-state">No tools yet — create one above.</div>
      ) : (
        <DataGrid<ToolDef> columnDefs={COLUMNS} rowData={tools} onRowClicked={(row) => router.push(`/configurations/tools/${row.id}`)} />
      )}
    </>
  );
}
