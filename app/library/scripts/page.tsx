"use client";

import { useEffect, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { api } from "../../lib/api.ts";
import type { ScriptDef } from "../../lib/types.ts";
import DataGrid from "../../components/DataGrid.tsx";

const COLUMNS: ColDef<ScriptDef>[] = [
  { field: "name", headerName: "Name", minWidth: 160 },
  { field: "command", headerName: "Command", flex: 2 },
  { field: "description", headerName: "Description", flex: 3 },
  {
    headerName: "Params",
    flex: 2,
    valueGetter: (p) =>
      Object.entries(p.data?.params ?? {})
        .map(([name, spec]) => (spec.required ? `${name}*` : name))
        .join(", "),
    tooltipValueGetter: (p) =>
      Object.entries(p.data?.params ?? {})
        .map(([name, spec]) => `${name}${spec.required ? " (required)" : ""}: ${spec.description}`)
        .join("\n"),
  },
];

export default function ScriptsPage() {
  const [data, setData] = useState<{ scripts: ScriptDef[]; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ scripts: ScriptDef[]; errors: string[] }>("/api/library/scripts").then(setData).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Scripts</h1>
      </div>
      <p className="muted">
        What a task&apos;s <code>script:</code> step can run, listed in <code>scripts.yaml</code> and edited there. A script gets RUN_DIR, TASK_DIR, STEP_INPUT, STEP_OUTPUT and its params as JOEY_PARAMS — see <code>scripts/joey.ts</code>. * = required param.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {data?.errors.map((e) => (
        <div key={e} className="error-banner">
          {e}
        </div>
      ))}

      {data === null ? (
        <p className="muted">Loading…</p>
      ) : data.scripts.length === 0 ? (
        <div className="empty-state">No scripts in scripts.yaml.</div>
      ) : (
        <DataGrid<ScriptDef> columnDefs={COLUMNS} rowData={data.scripts} />
      )}
    </>
  );
}
