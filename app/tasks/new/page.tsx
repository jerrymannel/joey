"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../lib/api.ts";
import type { Task } from "../../lib/types.ts";

export default function NewTaskPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const task = await api.post<Task>("/api/tasks", { name, folderPath });
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
