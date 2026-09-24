"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.ts";
import Link from "next/link";
import { AUTOMATION_LABELS, type EmailSummary, type PlaylistSummary, type Task, type TaskService } from "../lib/types.ts";
import CronScheduleInput from "./CronScheduleInput.tsx";

interface FormState {
  name: string;
  account: string;
  schedule: string;
  searchQuery: string;
  playlistId: string;
  folderPath: string;
  extensions: string;
  transcribe: boolean;
}

function formFromTask(task?: Task): FormState {
  return {
    name: task?.name ?? "",
    account: task?.account ?? "",
    schedule: task?.schedule ?? "",
    searchQuery: task?.searchQuery ?? "",
    playlistId: task?.playlistId ?? "",
    folderPath: task?.folderPath ?? "",
    extensions: task?.extensions ?? "",
    transcribe: task?.transcribe ?? true,
  };
}

/** The Create and Edit pages for a gmail/youtube/transcription automation both render this — see AGENTS.md's CRUD pattern. */
export default function AutomationForm({
  service,
  initial,
  onCancel,
  onSaved,
}: {
  service: TaskService;
  initial?: Task;
  onCancel: () => void;
  onSaved: (task: Task) => void;
}) {
  const [form, setForm] = useState<FormState>(formFromTask(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<EmailSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);

  const [accounts, setAccounts] = useState<string[] | null>(null);
  const google = service === "gmail" || service === "youtube";

  // The account comes first: the search preview and the playlist list below are read as it. Default to the first connected one.
  useEffect(() => {
    if (!google) return;
    api
      .get<{ accounts: { email: string }[] }>(`/api/settings/${service}`)
      .then((s) => {
        const emails = s.accounts.map((a) => a.email);
        setAccounts(emails);
        setForm((f) => (f.account || emails.length === 0 ? f : { ...f, account: emails[0] }));
      })
      .catch(() => setAccounts([]));
  }, [service, google]);

  useEffect(() => {
    if (service !== "youtube" || !form.account) return;
    setPlaylists(null);
    api
      .get<PlaylistSummary[]>(`/api/youtube/playlists?account=${encodeURIComponent(form.account)}`)
      .then(setPlaylists)
      .catch(() => setPlaylists([]));
  }, [service, form.account]);

  async function searchPreview() {
    setSearching(true);
    setError(null);
    try {
      setPreview(
        await api.get<EmailSummary[]>(
          `/api/gmail/search?q=${encodeURIComponent(form.searchQuery)}&account=${encodeURIComponent(form.account)}&maxResults=10`,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "search failed");
    } finally {
      setSearching(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const task = initial
        ? await api.patch<Task>(`/api/tasks/${initial.id}`, {
            name: form.name,
            account: form.account,
            schedule: form.schedule || null,
            searchQuery: form.searchQuery,
            playlistId: form.playlistId,
            ...(service === "transcription" && { folderPath: form.folderPath, extensions: form.extensions }),
            ...(service === "youtube" && { transcribe: form.transcribe }),
          })
        : await api.post<Task>("/api/tasks", {
            name: form.name,
            service,
            account: form.account,
            schedule: form.schedule || null,
            searchQuery: form.searchQuery,
            playlistId: form.playlistId,
            ...(service === "transcription" && { folderPath: form.folderPath, extensions: form.extensions }),
            ...(service === "youtube" && { transcribe: form.transcribe }),
          });
      onSaved(task);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save automation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={preview ? "split-layout" : undefined}>
    <div className="card form-page">
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="automation-name">Name</label>
          <input
            id="automation-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        {google && (
        <div className="field">
          <label htmlFor="automation-account">{AUTOMATION_LABELS[service]} account</label>
          <select
            id="automation-account"
            value={form.account}
            disabled={accounts === null}
            onChange={(e) => {
              // Everything below was read as the old account, so start it over.
              setForm((f) => ({ ...f, account: e.target.value, playlistId: "" }));
              setPreview(null);
            }}
            required
          >
            <option value="">Select an account…</option>
            {accounts?.map((email) => (
              <option key={email} value={email}>
                {email}
              </option>
            ))}
          </select>
          <p className="muted">
            {accounts?.length === 0 ? (
              <>
                No account connected — connect one under <Link href="/integrations/google">Integrations → Google</Link>.
              </>
            ) : (
              "This automation runs as this account; the settings below are read from it."
            )}
          </p>
        </div>
        )}
        <CronScheduleInput
          id="automation-schedule"
          value={form.schedule}
          onChange={(schedule) => setForm((f) => ({ ...f, schedule }))}
        />
        {service === "gmail" && (
          <div className="field">
            <label htmlFor="automation-search-query">Gmail search string</label>
            <div className="row">
              <input
                id="automation-search-query"
                value={form.searchQuery}
                onChange={(e) => setForm((f) => ({ ...f, searchQuery: e.target.value }))}
                placeholder="e.g. from:someone@example.com is:unread"
                style={{ flex: 1 }}
              />
              <button type="button" className="secondary" disabled={searching} onClick={searchPreview}>
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
            <p className="muted">This automation will run against mail matching this Gmail search query.</p>
          </div>
        )}
        {service === "youtube" && (
          <div className="field">
            <label htmlFor="automation-playlist">Playlist</label>
            <select
              id="automation-playlist"
              value={form.playlistId}
              disabled={playlists === null}
              onChange={(e) => setForm((f) => ({ ...f, playlistId: e.target.value }))}
            >
              <option value="">Select a playlist…</option>
              {form.playlistId && !playlists?.some((p) => p.id === form.playlistId) && (
                <option value={form.playlistId}>{form.playlistId} (saved)</option>
              )}
              {playlists?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <p className="muted">This automation will download videos from this playlist.</p>
            <label className="row" style={{ fontWeight: "normal" }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={form.transcribe}
                onChange={(e) => setForm((f) => ({ ...f, transcribe: e.target.checked }))}
              />
              Transcribe each video after it downloads
            </label>
            <p className="muted">
              Whisper writes <code>audio.mp3.transcribed.txt</code> into the video's folder. Needs Whisper installed — see the README.
            </p>
          </div>
        )}
        {service === "transcription" && (
          <>
            <div className="field">
              <label htmlFor="automation-folder">Folder path (absolute)</label>
              <input
                id="automation-folder"
                value={form.folderPath}
                onChange={(e) => setForm((f) => ({ ...f, folderPath: e.target.value }))}
                placeholder="/Users/me/recordings"
                required
              />
              <p className="muted">This folder and all its sub folders are searched for audio files.</p>
            </div>
            <div className="field">
              <label htmlFor="automation-extensions">File extensions</label>
              <input
                id="automation-extensions"
                value={form.extensions}
                onChange={(e) => setForm((f) => ({ ...f, extensions: e.target.value }))}
                placeholder="mp3, wav, m4a"
                required
              />
              <p className="muted">
                Matching files are transcribed with Whisper into <code>&lt;file name&gt;.transcribed.txt</code> beside them, and every transcript's path is
                listed in <code>transcribed-files.txt</code> at the folder's root.
              </p>
            </div>
          </>
        )}
        <div className="row">
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : initial ? "Save" : "Create"}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
    {preview && (
      <div className="card">
        <h3>Matching emails</h3>
        {preview.length === 0 ? (
          <div className="empty-state">No matching emails.</div>
        ) : (
          <div className="scroll-card">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>Subject</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((e) => (
                  <tr key={e.id}>
                    <td>{e.from}</td>
                    <td>{e.subject || "(no subject)"}</td>
                    <td>
                      <span className={`badge ${e.unread ? "badge-unread" : ""}`}>{e.unread ? "Unread" : "Read"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}
    </div>
  );
}
