"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api.ts";
import Markdown from "./Markdown.tsx";
import Yaml from "./Yaml.tsx";

/** A markdown file in a library folder; `kind: "folder"` is a skill folder, whose text is its SKILL.md. */
export interface LibraryFile {
  name: string;
  kind?: "folder" | "file";
  content: string;
}

/** Markdown, with a leading `---` yaml frontmatter block (a skill's name/description) shown as yaml rather than mangled into text. */
function Rendered({ content }: { content: string }) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!m) return <Markdown>{content}</Markdown>;
  return (
    <>
      <Yaml source={m[1]} />
      <Markdown>{content.slice(m[0].length)}</Markdown>
    </>
  );
}

// null = viewing; "new" = creating; { edit } = editing that file.
type Mode = null | "new" | { edit: string };

/**
 * A folder of markdown files (prompts/, skills/): a searchable list, the selected file rendered on the right (`#<name>` or
 * the first one), and New/Edit. `endpoint` GETs the list, POSTs `{ name, content }` and PUTs `<endpoint>/<name>` `{ content }`.
 */
export default function FileLibrary({ title, folder, endpoint, intro, placeholder }: { title: string; folder: string; endpoint: string; intro: ReactNode; placeholder: string }) {
  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<LibraryFile[]>(endpoint)
      .then((list) => {
        setFiles(list);
        // Other pages link here as #<name>; otherwise start on the first file.
        const hash = decodeURIComponent(location.hash.slice(1));
        setSelected(list.some((f) => f.name === hash) ? hash : (list[0]?.name ?? null));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [endpoint]);

  function select(file: string) {
    setSelected(file);
    setMode(null);
    history.replaceState(null, "", `#${encodeURIComponent(file)}`);
  }

  const current = files?.find((f) => f.name === selected) ?? null;
  const shown = files?.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  const pathOf = (f: LibraryFile) => `${folder}/${f.name}${f.kind === "folder" ? "/SKILL.md" : ""}`;

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
          ? await api.post<LibraryFile>(endpoint, { name: name.trim(), content: draft })
          : await api.put<LibraryFile>(`${endpoint}/${encodeURIComponent(current!.name)}`, { content: draft });
      setFiles((list) => [...(list ?? []).filter((f) => f.name !== saved.name), saved].sort((a, b) => a.name.localeCompare(b.name)));
      select(saved.name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `failed to save the file`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>{title}</h1>
        <button type="button" onClick={startNew} disabled={files === null}>New</button>
      </div>
      <p className="muted">{intro}</p>

      {error && <div className="error-banner">{error}</div>}

      {files === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="split-layout">
          <div className="card">
            <input type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
            {shown.length === 0 ? (
              <p className="empty-state">{files.length === 0 ? `Nothing in ${folder}/ yet.` : "No match."}</p>
            ) : (
              <table>
                <tbody>
                  {shown.map((f) => (
                    <tr key={f.name} className={`clickable ${f.name === selected && mode !== "new" ? "active" : ""}`} onClick={() => select(f.name)}>
                      <td>
                        {f.name}
                        {f.kind === "folder" && <span className="muted">/</span>}
                      </td>
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
                      <span className="muted">{folder}/</span>
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} autoFocus />
                      <span className="muted">.md</span>
                    </span>
                  ) : (
                    <strong>Edit {pathOf(current!)}</strong>
                  )}
                  <span className="row">
                    <button type="button" onClick={save} disabled={saving || (mode === "new" && !name.trim())}>{saving ? "Saving…" : mode === "new" ? "Create" : "Save"}</button>
                    <button type="button" className="secondary" onClick={() => setMode(null)} disabled={saving}>Cancel</button>
                  </span>
                </div>
                <textarea style={{ width: "100%", minHeight: 420, fontFamily: "var(--font-mono)" }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Markdown…" spellCheck={false} />
              </>
            ) : current ? (
              <>
                <div className="page-header" style={{ marginTop: 0 }}>
                  <strong>{pathOf(current)}</strong>
                  <button type="button" className="secondary" onClick={startEdit}>Edit</button>
                </div>
                {current.content ? <Rendered content={current.content} /> : <p className="muted">(empty)</p>}
              </>
            ) : (
              <div className="empty-state">Nothing selected — add one with New.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
