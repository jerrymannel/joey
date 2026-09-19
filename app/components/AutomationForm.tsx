"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.ts";
import type { EmailSummary, PlaylistSummary, Task, TaskService } from "../lib/types.ts";
import CronScheduleInput from "./CronScheduleInput.tsx";

interface FormState {
  name: string;
  schedule: string;
  searchQuery: string;
  playlistId: string;
}

function formFromTask(task?: Task): FormState {
  return {
    name: task?.name ?? "",
    schedule: task?.schedule ?? "",
    searchQuery: task?.searchQuery ?? "",
    playlistId: task?.playlistId ?? "",
  };
}

/** The Create and Edit pages for a gmail/youtube automation both render this — see AGENTS.md's CRUD pattern. */
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

  useEffect(() => {
    if (service === "youtube") {
      api.get<PlaylistSummary[]>("/api/youtube/playlists").then(setPlaylists).catch(() => setPlaylists([]));
    }
  }, [service]);

  async function searchPreview() {
    setSearching(true);
    setError(null);
    try {
      setPreview(
        await api.get<EmailSummary[]>(
          `/api/gmail/search?q=${encodeURIComponent(form.searchQuery)}&maxResults=10`,
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
            schedule: form.schedule || null,
            searchQuery: form.searchQuery,
            playlistId: form.playlistId,
          })
        : await api.post<Task>("/api/tasks", {
            name: form.name,
            service,
            schedule: form.schedule || null,
            searchQuery: form.searchQuery,
            playlistId: form.playlistId,
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
          </div>
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
