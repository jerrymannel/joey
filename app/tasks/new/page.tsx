"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../lib/api.ts";
import type { AiModel, Task, ToolDef } from "../../lib/types.ts";

export default function NewTaskPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [toolIds, setToolIds] = useState<string[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AiModel[]>("/api/models").then((ms) => setModels(ms.filter((m) => m.enabled))).catch(() => {});
    api.get<ToolDef[]>("/api/tools").then(setTools).catch(() => {});
  }, []);

  function toggleTool(toolId: string) {
    setToolIds((ids) => (ids.includes(toolId) ? ids.filter((t) => t !== toolId) : [...ids, toolId]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const task = await api.post<Task>("/api/tasks", { name, folderPath, prompt, model, toolIds });
      router.push(`/tasks/${task.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to create task");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <p className="crumb">
        <Link href="/tasks">← Tasks</Link>
      </p>
      <div className="page-header">
        <h1>New task</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card form-page">
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="folderPath">Folder path (absolute)</label>
            <input
              id="folderPath"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="/Users/you/projects/my-repo"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="prompt">Prompt / instructions</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what the agent should do…"
            />
          </div>
          <div className="field">
            <label htmlFor="model">Model</label>
            <select id="model" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">Default</option>
              {models.map((m) => (
                <option key={m.id} value={m.value}>
                  {m.name}
                </option>
              ))}
            </select>
            {models.length === 0 && <p className="muted">No models configured yet — add one under Configurations → Models.</p>}
          </div>
          {tools.length > 0 && (
            <div className="field">
              <label>Tools</label>
              {tools.map((t) => (
                <label key={t.id} className="row" style={{ fontSize: 13, fontWeight: "normal" }}>
                  <input
                    type="checkbox"
                    checked={toolIds.includes(t.id)}
                    onChange={() => toggleTool(t.id)}
                    style={{ width: "auto" }}
                  />
                  {t.name}
                </label>
              ))}
            </div>
          )}
          <div className="row">
            <button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </button>
            <button type="button" className="secondary" onClick={() => router.push("/tasks")}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
