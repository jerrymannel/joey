"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColDef } from "ag-grid-community";
import { api } from "../../lib/api.ts";
import type { Prompt } from "../../lib/types.ts";
import DataGrid from "../../components/DataGrid.tsx";

const COLUMNS: ColDef<Prompt>[] = [
  { field: "name", headerName: "Name", flex: 1 },
  { field: "content", headerName: "Content", flex: 2 },
];

export default function PromptsPage() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Prompt[]>("/api/prompts").then(setPrompts).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Prompts</h1>
        <button type="button" onClick={() => router.push("/configurations/prompts/new")}>
          + New prompt
        </button>
      </div>
      <p className="muted">Saved instructions to reuse when creating an automation.</p>

      {error && <div className="error-banner">{error}</div>}

      {prompts === null ? (
        <p className="muted">Loading…</p>
      ) : prompts.length === 0 ? (
        <div className="empty-state">No prompts yet — create one above.</div>
      ) : (
        <DataGrid<Prompt> columnDefs={COLUMNS} rowData={prompts} onRowClicked={(row) => router.push(`/configurations/prompts/${row.id}`)} />
      )}
    </>
  );
}
