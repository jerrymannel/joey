"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { api, ApiError } from "../../lib/api.ts";
import type { AiModel } from "../../lib/types.ts";
import DataGrid from "../../components/DataGrid.tsx";
import ConfirmModal from "../../components/ConfirmModal.tsx";
import SidePanel from "../../components/SidePanel.tsx";
import ModelForm from "../../components/ModelForm.tsx";

/** What the side panel is showing: a new-model form, or an existing model read-only / being edited. */
type Panel = { mode: "create" } | { mode: "view" | "edit"; id: string };

export default function ModelsPage() {
  const [models, setModels] = useState<AiModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [deleting, setDeleting] = useState<AiModel | null>(null);

  useEffect(() => {
    api.get<AiModel[]>("/api/models").then(setModels).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  // No closure over `models` — everything goes through setModels' updater — so this can be memoised
  // and ag-grid doesn't rebuild its columns on every render.
  const columns = useMemo<ColDef<AiModel>[]>(() => {
    async function setEnabled(model: AiModel, enabled: boolean) {
      try {
        const updated = await api.patch<AiModel>(`/api/models/${model.id}`, { enabled });
        setModels((ms) => ms && ms.map((m) => (m.id === updated.id ? updated : m)));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "failed to update model");
      }
    }
    return [
      { field: "name", headerName: "Name", flex: 1 },
      { field: "value", headerName: "Value", flex: 1 },
      { field: "endpoint", headerName: "Endpoint", flex: 1, valueFormatter: (p) => p.value || "—" },
      {
        headerName: "Enabled",
        width: 120,
        flex: 0,
        sortable: false,
        cellRenderer: (p: { data?: AiModel }) =>
          p.data && (
            <button
              type="button"
              className={p.data.enabled ? undefined : "secondary"}
              style={{ padding: "0 10px", height: 24, lineHeight: 1, minWidth: 74 }}
              aria-pressed={p.data.enabled}
              title={p.data.enabled ? "Click to disable" : "Click to enable"}
              onClick={() => setEnabled(p.data!, !p.data!.enabled)}
            >
              {p.data.enabled ? "Enabled" : "Disabled"}
            </button>
          ),
      },
      {
        headerName: "",
        width: 90,
        flex: 0,
        sortable: false,
        cellRenderer: (p: { data?: AiModel }) =>
          p.data && !p.data.isDefault && (
            <button type="button" className="danger" style={{ padding: "0 8px", height: 24, lineHeight: 1 }} onClick={() => setDeleting(p.data!)}>
              Delete
            </button>
          ),
      },
    ];
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/models/${deleting.id}`);
      setModels((ms) => ms && ms.filter((m) => m.id !== deleting.id));
      setPanel((p) => (p && p.mode !== "create" && p.id === deleting.id ? null : p));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to delete model");
    }
    setDeleting(null);
  }

  function saved(model: AiModel) {
    setModels((ms) => ms && (ms.some((m) => m.id === model.id) ? ms.map((m) => (m.id === model.id ? model : m)) : [...ms, model]));
    setPanel({ mode: "view", id: model.id });
  }

  const selected = panel && panel.mode !== "create" ? models?.find((m) => m.id === panel.id) : undefined;

  return (
    <>
      <div className="page-header">
        <h1>Models</h1>
        <button type="button" onClick={() => setPanel({ mode: "create" })}>
          + New model
        </button>
      </div>
      <p className="muted">
        AI models available to automations, by name and the value passed to the harness. Disabled models are hidden from the
        pickers. Default models can be disabled but not edited or deleted.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {models === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <DataGrid<AiModel> height={620} columnDefs={columns} rowData={models} onRowClicked={(row) => setPanel({ mode: "view", id: row.id })} />
      )}

      {panel?.mode === "create" && (
        <SidePanel title="New model" onClose={() => setPanel(null)}>
          <ModelForm onCancel={() => setPanel(null)} onSaved={saved} />
        </SidePanel>
      )}

      {panel?.mode === "edit" && selected && (
        <SidePanel title="Edit model" onClose={() => setPanel(null)}>
          <ModelForm initial={selected} onCancel={() => setPanel({ mode: "view", id: selected.id })} onSaved={saved} />
        </SidePanel>
      )}

      {panel?.mode === "view" && selected && (
        <SidePanel title={selected.name} onClose={() => setPanel(null)}>
          <div>
            <div className="field">
              <label>Value</label>
              <p style={{ margin: 0 }}>{selected.value}</p>
            </div>
            {selected.endpoint && (
              <div className="field">
                <label>Endpoint</label>
                <p style={{ margin: 0 }}>{selected.endpoint}</p>
              </div>
            )}
            <div className="field">
              <label>Status</label>
              <p style={{ margin: 0 }}>{selected.enabled ? "Enabled" : "Disabled"}</p>
            </div>
            {selected.isDefault && <p className="muted">Default model — can be disabled, but not edited or deleted.</p>}
          </div>
          <div className="row">
            {!selected.isDefault && (
              <>
                <button type="button" onClick={() => setPanel({ mode: "edit", id: selected.id })}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => setDeleting(selected)}>
                  Delete
                </button>
              </>
            )}
            <button type="button" className="secondary" onClick={() => setPanel(null)}>
              Close
            </button>
          </div>
        </SidePanel>
      )}

      {deleting && (
        <ConfirmModal
          title="Delete model?"
          message={`"${deleting.name}" will no longer be selectable on automations.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
