"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { api, ApiError } from "../../lib/api.ts";
import type { SshConfig } from "../../lib/types.ts";
import DataGrid from "../../components/DataGrid.tsx";
import ConfirmModal from "../../components/ConfirmModal.tsx";
import SidePanel from "../../components/SidePanel.tsx";
import SshForm from "../../components/SshForm.tsx";

/** What the side panel is showing: a new-configuration form, or an existing one read-only / being edited. */
type Panel = { mode: "create" } | { mode: "view" | "edit"; id: string };

const AUTH_LABEL = { password: "Password", identity: "Identity (private key)" } as const;

export default function SshPage() {
  const [configs, setConfigs] = useState<SshConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [deleting, setDeleting] = useState<SshConfig | null>(null);

  useEffect(() => {
    api.get<SshConfig[]>("/api/ssh").then(setConfigs).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const columns = useMemo<ColDef<SshConfig>[]>(
    () => [
      { field: "name", headerName: "Name", flex: 1 },
      { field: "host", headerName: "IP", flex: 1 },
      { field: "username", headerName: "Username", flex: 1 },
      { field: "authMethod", headerName: "Auth", flex: 1, valueFormatter: (p) => AUTH_LABEL[p.value as SshConfig["authMethod"]] ?? p.value },
      {
        headerName: "",
        width: 90,
        flex: 0,
        sortable: false,
        cellRenderer: (p: { data?: SshConfig }) =>
          p.data && (
            <button type="button" className="danger" style={{ padding: "0 8px", height: 24, lineHeight: 1 }} onClick={() => setDeleting(p.data!)}>
              Delete
            </button>
          ),
      },
    ],
    [],
  );

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/ssh/${deleting.id}`);
      setConfigs((cs) => cs && cs.filter((c) => c.id !== deleting.id));
      setPanel((p) => (p && p.mode !== "create" && p.id === deleting.id ? null : p));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to delete SSH configuration");
    }
    setDeleting(null);
  }

  function saved(config: SshConfig) {
    setConfigs((cs) => cs && (cs.some((c) => c.id === config.id) ? cs.map((c) => (c.id === config.id ? config : c)) : [...cs, config]));
    setPanel({ mode: "view", id: config.id });
  }

  const selected = panel && panel.mode !== "create" ? configs?.find((c) => c.id === panel.id) : undefined;

  return (
    <>
      <div className="page-header">
        <h1>SSH</h1>
        <button type="button" onClick={() => setPanel({ mode: "create" })}>
          + New SSH configuration
        </button>
      </div>
      <p className="muted">
        Remote servers a task can run commands on. Enable the <code>ssh_list_servers</code> and <code>ssh_run_command</code> tools on a task to give it access to
        all of them. Passwords and keys are stored encrypted.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {configs === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <DataGrid<SshConfig> height={620} columnDefs={columns} rowData={configs} onRowClicked={(row) => setPanel({ mode: "view", id: row.id })} />
      )}

      {panel?.mode === "create" && (
        <SidePanel title="New SSH configuration" onClose={() => setPanel(null)}>
          <SshForm onCancel={() => setPanel(null)} onSaved={saved} />
        </SidePanel>
      )}

      {panel?.mode === "edit" && selected && (
        <SidePanel title="Edit SSH configuration" onClose={() => setPanel(null)}>
          <SshForm initial={selected} onCancel={() => setPanel({ mode: "view", id: selected.id })} onSaved={saved} />
        </SidePanel>
      )}

      {panel?.mode === "view" && selected && (
        <SidePanel title={selected.name} onClose={() => setPanel(null)}>
          <div>
            <div className="field">
              <label>IP</label>
              <p style={{ margin: 0 }}>{selected.host}</p>
            </div>
            <div className="field">
              <label>Username</label>
              <p style={{ margin: 0 }}>{selected.username}</p>
            </div>
            <div className="field">
              <label>Auth method</label>
              <p style={{ margin: 0 }}>{AUTH_LABEL[selected.authMethod]}</p>
            </div>
            <p className="muted">The saved {selected.authMethod === "password" ? "password" : "key"} is encrypted and isn't shown.</p>
          </div>
          <div className="row">
            <button type="button" onClick={() => setPanel({ mode: "edit", id: selected.id })}>
              Edit
            </button>
            <button type="button" className="danger" onClick={() => setDeleting(selected)}>
              Delete
            </button>
            <button type="button" className="secondary" onClick={() => setPanel(null)}>
              Close
            </button>
          </div>
        </SidePanel>
      )}

      {deleting && (
        <ConfirmModal title="Delete SSH configuration?" message={`"${deleting.name}" will no longer be reachable by tasks' ssh tools.`} onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
      )}
    </>
  );
}
