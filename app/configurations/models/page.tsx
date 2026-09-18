"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColDef } from "ag-grid-community";
import { api } from "../../lib/api.ts";
import type { AiModel } from "../../lib/types.ts";
import DataGrid from "../../components/DataGrid.tsx";

const COLUMNS: ColDef<AiModel>[] = [
  { field: "name", headerName: "Name", flex: 1 },
  { field: "value", headerName: "Value", flex: 1 },
  { field: "endpoint", headerName: "Endpoint", flex: 1, valueFormatter: (p) => p.value || "—" },
];

export default function ModelsPage() {
  const router = useRouter();
  const [models, setModels] = useState<AiModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AiModel[]>("/api/models").then(setModels).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Models</h1>
        <button type="button" onClick={() => router.push("/configurations/models/new")}>
          + New model
        </button>
      </div>
      <p className="muted">AI models available to automations, by name and the value passed to the harness.</p>

      {error && <div className="error-banner">{error}</div>}

      {models === null ? (
        <p className="muted">Loading…</p>
      ) : models.length === 0 ? (
        <div className="empty-state">No models yet — create one above.</div>
      ) : (
        <DataGrid<AiModel> columnDefs={COLUMNS} rowData={models} onRowClicked={(row) => router.push(`/configurations/models/${row.id}`)} />
      )}
    </>
  );
}
