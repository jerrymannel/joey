"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api.ts";
import type { GeneralSettings } from "../../lib/types.ts";

export default function GeneralSettingsPage() {
  const [workspaceFolder, setWorkspaceFolder] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<GeneralSettings>("/api/settings/general")
      .then((s) => setWorkspaceFolder(s.workspaceFolder ?? ""))
      .finally(() => setLoaded(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put<GeneralSettings>("/api/settings/general", { workspaceFolder });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>General settings</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card form-page">
        <form onSubmit={save}>
          <div className="field">
            <label htmlFor="workspace-folder">Workspace folder (absolute path)</label>
            <input
              id="workspace-folder"
              value={workspaceFolder}
              onChange={(e) => {
                setWorkspaceFolder(e.target.value);
                setSaved(false);
              }}
              placeholder="/Users/you/automations"
              disabled={!loaded}
              required
            />
            <p className="muted">
              Each gmail/youtube automation runs in its own subfolder under this workspace, named after the
              automation's id.
            </p>
          </div>
          {saved && <p className="muted">Saved.</p>}
          <button type="submit" disabled={saving || !loaded}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </>
  );
}
