"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api.ts";
import type { PromptFile } from "../../lib/types.ts";
import Markdown from "../../components/Markdown.tsx";

// null = viewing; "new" = creating; a name = editing that prompt.
type Mode = null | "new" | { edit: string };

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<PromptFile[]>("/api/library/prompts")
      .then((list) => {
        setPrompts(list);
        // Task pages link here as #<file name>; otherwise start on the first prompt.
        const hash = decodeURIComponent(location.hash.slice(1));
        setSelected(list.some((p) => p.name === hash) ? hash : (list[0]?.name ?? null));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  function select(file: string) {
    setSelected(file);
    setMode(null);
    history.replaceState(null, "", `#${encodeURIComponent(file)}`);
  }

  const current = prompts?.find((p) => p.name === selected) ?? null;
  const shown = prompts?.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())) ?? [];

  function startNew() {
    setName("");
    setDraft("");
    setError(null);
    setMode("new");
  }

  function startEdit() {
    if (!current) return;
    setDraft(current.content);
    setError(null);
    setMode({ edit: current.name });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved =
        mode === "new"
          ? await api.post<PromptFile>("/api/library/prompts", { name: name.trim(), content: draft })
          : await api.put<PromptFile>(`/api/library/prompts/${encodeURIComponent(current!.name)}`, { content: draft });
      setPrompts((list) => [...(list ?? []).filter((p) => p.name !== saved.name), saved].sort((a, b) => a.name.localeCompare(b.name)));
      select(saved.name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save the prompt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Prompts</h1>
        <button type="button" onClick={startNew} disabled={prompts === null}>New prompt</button>
      </div>
      <p className="muted">
        The files in <code>prompts/</code>. An agent step names one as its <code>instructionsFile:</code>; it&apos;s read at run time, so an edit applies to the next run.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {prompts === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="split-layout">
          <div className="card">
            <input type="search" placeholder="Search prompts…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
            {shown.length === 0 ? (
              <p className="empty-state">{prompts.length === 0 ? "No prompt files yet." : "No match."}</p>
            ) : (
              <table>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.name} className={`clickable ${p.name === selected && mode !== "new" ? "active" : ""}`} onClick={() => select(p.name)}>
                      <td>{p.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            {mode ? (
              <>
                <div className="page-header" style={{ marginTop: 0 }}>
                  {mode === "new" ? (
                    <span className="row">
                      <span className="muted">prompts/</span>
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="summarise-emails" autoFocus />
                      <span className="muted">.md</span>
                    </span>
                  ) : (
                    <strong>Edit prompts/{mode.edit}</strong>
                  )}
                  <span className="row">
                    <button type="button" onClick={save} disabled={saving || (mode === "new" && !name.trim())}>{saving ? "Saving…" : mode === "new" ? "Create" : "Save"}</button>
                    <button type="button" className="secondary" onClick={() => setMode(null)} disabled={saving}>Cancel</button>
                  </span>
                </div>
                <textarea style={{ width: "100%", minHeight: 420, fontFamily: "var(--font-mono)" }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Markdown instructions for the agent…" spellCheck={false} />
              </>
            ) : current ? (
              <>
                <div className="page-header" style={{ marginTop: 0 }}>
                  <strong>prompts/{current.name}</strong>
                  <button type="button" className="secondary" onClick={startEdit}>Edit</button>
                </div>
                <Markdown>{current.content}</Markdown>
              </>
            ) : (
              <div className="empty-state">No prompt selected — add one with New prompt.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
