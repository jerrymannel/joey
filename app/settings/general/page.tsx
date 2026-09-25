"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api.ts";
import type { GeneralSettings } from "../../lib/types.ts";

export default function GeneralSettingsPage() {
  const [workspaceFolder, setWorkspaceFolder] = useState("");
  const [mailAccount, setMailAccount] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The Google connect flow returns here with ?mailError=... on failure.
    const mailError = new URLSearchParams(window.location.search).get("mailError");
    if (mailError) setError(mailError);
    api
      .get<GeneralSettings>("/api/settings/general")
      .then((s) => {
        setWorkspaceFolder(s.workspaceFolder ?? "");
        setMailAccount(s.mailAccount ?? "");
        setUserEmail(s.userEmail);
      })
      .finally(() => setLoaded(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put<GeneralSettings>("/api/settings/general", { workspaceFolder, userEmail });
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
              placeholder="/Users/you/joey-workspace"
              disabled={!loaded}
              required
            />
            <p className="muted">
              Where tasks run: each task gets a folder here named after its file (kept between runs), and each run a
              timestamped folder inside that with its steps' outputs, agent sessions and result.
            </p>
          </div>
          <div className="field">
            <label htmlFor="user-email">Your email address</label>
            <input
              id="user-email"
              type="email"
              value={userEmail}
              onChange={(e) => {
                setUserEmail(e.target.value);
                setSaved(false);
              }}
              placeholder="you@example.com"
              disabled={!loaded}
            />
            <p className="muted">
              Where an agent&apos;s <code>task_send_result</code> emails a run&apos;s result (it&apos;s always saved as the
              run&apos;s result.md too). Sent from the account below.
            </p>
          </div>
          <div className="field">
            <label>Send results from (Gmail account)</label>
            <div className="row">
              <span>{mailAccount || "Not connected — results are only saved, not emailed"}</span>
              <a href="/api/settings/google/connect?service=gmail&mailbox=1">
                <button type="button" className="secondary">
                  {mailAccount ? "Reconnect" : "Connect"}
                </button>
              </a>
            </div>
            <p className="muted">
              Needs the Google Client ID and Secret from Integrations → Google. To stop emailing results, disconnect
              the account there.
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
