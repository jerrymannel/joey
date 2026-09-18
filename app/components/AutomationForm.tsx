"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.ts";
import type { AiModel, EmailSummary, PlaylistSummary, Task, TaskService, ToolDef } from "../lib/types.ts";
import { THINKING_LEVELS } from "../lib/types.ts";
import CronScheduleInput from "./CronScheduleInput.tsx";

interface FormState {
  name: string;
  prompt: string;
  schedule: string;
  model: string;
  toolIds: string[];
  searchQuery: string;
  playlistId: string;
  thinkingLevel: string;
  trustFolder: boolean;
}

function formFromTask(task?: Task): FormState {
  return {
    name: task?.name ?? "",
    prompt: task?.prompt ?? "",
    schedule: task?.schedule ?? "",
    model: task?.model ?? "",
    toolIds: task?.toolIds ?? [],
    searchQuery: task?.searchQuery ?? "",
    playlistId: task?.playlistId ?? "",
    thinkingLevel: task?.thinkingLevel ?? "",
    trustFolder: task?.trustFolder ?? false,
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
  const [models, setModels] = useState<AiModel[]>([]);
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [form, setForm] = useState<FormState>(formFromTask(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<EmailSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);

  useEffect(() => {
    api.get<AiModel[]>("/api/models").then(setModels).catch(() => {});
    api.get<ToolDef[]>(`/api/tools?service=${service}`).then(setTools).catch(() => {});
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

  function toggleTool(toolId: string) {
    setForm((f) => ({
      ...f,
      toolIds: f.toolIds.includes(toolId) ? f.toolIds.filter((t) => t !== toolId) : [...f.toolIds, toolId],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const task = initial
        ? await api.patch<Task>(`/api/tasks/${initial.id}`, {
            name: form.name,
            prompt: form.prompt,
            model: form.model,
            schedule: form.schedule || null,
            toolIds: form.toolIds,
            searchQuery: form.searchQuery,
            playlistId: form.playlistId,
            thinkingLevel: form.thinkingLevel,
            trustFolder: form.trustFolder,
          })
        : await api.post<Task>("/api/tasks", {
            name: form.name,
            service,
            prompt: form.prompt,
            model: form.model,
            schedule: form.schedule || null,
            toolIds: form.toolIds,
            searchQuery: form.searchQuery,
            playlistId: form.playlistId,
            thinkingLevel: form.thinkingLevel,
            trustFolder: form.trustFolder,
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
        <div className="field">
          <label htmlFor="automation-prompt">Instruction</label>
          <textarea
            id="automation-prompt"
            value={form.prompt}
            onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
            placeholder="Describe what this automation should do…"
          />
        </div>
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
        <div className="field">
          <label htmlFor="automation-model">Model</label>
          <select
            id="automation-model"
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
          >
            <option value="">Default</option>
            {models.map((m) => (
              <option key={m.id} value={m.value}>
                {m.name}
              </option>
            ))}
          </select>
          {models.length === 0 && <p className="muted">No models configured yet — add one under Configurations → Models.</p>}
        </div>
        <div className="field">
          <label htmlFor="automation-thinking-level">Thinking level (pi)</label>
          <select
            id="automation-thinking-level"
            value={form.thinkingLevel}
            onChange={(e) => setForm((f) => ({ ...f, thinkingLevel: e.target.value }))}
          >
            <option value="">Default</option>
            {THINKING_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="row" style={{ fontWeight: "normal" }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={form.trustFolder}
              onChange={(e) => setForm((f) => ({ ...f, trustFolder: e.target.checked }))}
            />
            Trust this automation's folder (pi runs without permission prompts)
          </label>
        </div>
        {tools.length > 0 && (
          <div className="field">
            <label>Tools</label>
            {tools.map((t) => (
              <label key={t.id} className="row" style={{ fontSize: 13, fontWeight: "normal" }}>
                <input
                  type="checkbox"
                  checked={form.toolIds.includes(t.id)}
                  onChange={() => toggleTool(t.id)}
                  style={{ width: "auto" }}
                />
                {t.name}
              </label>
            ))}
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
