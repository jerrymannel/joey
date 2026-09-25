"use client";

import { useEffect, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { api } from "../../lib/api.ts";
import type { McpServerSummary } from "../../lib/types.ts";
import DataGrid from "../../components/DataGrid.tsx";

const COLUMNS: ColDef<McpServerSummary>[] = [
  { field: "name", headerName: "Name" },
  { headerName: "Runs", flex: 3, valueGetter: (p) => p.data?.url || p.data?.command || "" },
  { field: "envKeys", headerName: "Env", flex: 2, valueFormatter: (p) => (p.value as string[]).join(", ") },
];

export default function McpPage() {
  const [data, setData] = useState<{ servers: McpServerSummary[]; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ servers: McpServerSummary[]; errors: string[] }>("/api/library/mcp").then(setData).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>MCP servers</h1>
      </div>
      <p className="muted">
        The servers in <code>mcp.json</code> (<code>{"{ \"mcpServers\": { … } }"}</code>), edited there. An agent lists the ones it gets under <code>mcp:</code>. Env values aren&apos;t shown.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {data?.errors.map((e) => (
        <div key={e} className="error-banner">
          {e}
        </div>
      ))}

      {data === null ? (
        <p className="muted">Loading…</p>
      ) : data.servers.length === 0 ? (
        <div className="empty-state">No MCP servers — create mcp.json in the repo to add some.</div>
      ) : (
        <DataGrid<McpServerSummary> columnDefs={COLUMNS} rowData={data.servers} />
      )}
    </>
  );
}
