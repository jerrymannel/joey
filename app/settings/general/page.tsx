"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api.ts";
import type { GeneralSettings } from "../../lib/types.ts";

export default function GeneralSettingsPage() {
  const [workspaceFolder, setWorkspaceFolder] = useState("");
  const [resultsFolder, setResultsFolder] = useState("");
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
        setResultsFolder(s.resultsFolder);
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
      await api.put<GeneralSettings>("/api/settings/general", { workspaceFolder, resultsFolder, userEmail });
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
          <div className="field">
            <label htmlFor="results-folder">Results folder (absolute path)</label>
            <input
              id="results-folder"
              value={resultsFolder}
              onChange={(e) => {
                setResultsFolder(e.target.value);
                setSaved(false);
              }}
              disabled={!loaded}
              required
            />
            <p className="muted">
              Each run's final output is written here as a file. Defaults to a results folder in the folder this
              app runs from. Changing it doesn't move existing results.
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
              Where an agent emails its final result, in addition to saving it in the Results folder. Sent from the
              agent mailbox below; without an address here, results go to the mailbox's own +results address.
            </p>
          </div>
          <div className="field">
            <label>Agent mailbox (Gmail account)</label>
            <div className="row">
              <span>{mailAccount || "Not connected — agent mail is off"}</span>
              <a href="/api/settings/google/connect?service=gmail&mailbox=1">
                <button type="button" className="secondary">
                  {mailAccount ? "Reconnect" : "Connect"}
                </button>
              </a>
            </div>
            <p className="muted">
              The inbox agents use to talk to each other and to you. Each task is reachable at its own address —
              for you@gmail.com, <code>you+&lt;task id&gt;@gmail.com</code> — and unread mail sent there triggers
              that task's next run. Needs the Google Client ID and Secret from Integrations → Google. To turn it
              off, disconnect the account there.
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
