"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../lib/api.ts";
import type { Run, Task } from "../lib/types.ts";

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [lastRunStatus, setLastRunStatus] = useState<Record<string, Run | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .get<Task[]>("/api/tasks")
      .then(async (loaded) => {
        setTasks(loaded);
        const entries = await Promise.all(
          loaded.map(async (task) => {
            const runs = await api.get<Run[]>(`/api/tasks/${task.id}/runs`).catch(() => []);
            return [task.id, runs[0]] as const;
          }),
        );
        setLastRunStatus(Object.fromEntries(entries));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function createTask(e: React.FormEvent) {
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
      <div className="page-header">
        <h1>Tasks</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h3>New Task</h3>
        <form onSubmit={createTask}>
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
          <button type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create Task"}
          </button>
        </form>
      </div>

      <div className="card">
        {tasks === null ? (
          <p className="muted">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="empty-state">No tasks yet — create one above.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Folder</th>
                <th>Repo</th>
                <th>Last run</th>
                <th>Max parallel</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const lastRun = lastRunStatus[task.id];
                return (
                  <tr key={task.id} className="clickable" onClick={() => router.push(`/tasks/${task.id}`)}>
                    <td>{task.name}</td>
                    <td className="muted">{task.folderPath}</td>
                    <td>
                      <span className={`badge ${task.isGitRepo ? "badge-git" : "badge-nongit"}`}>
                        {task.isGitRepo ? "git" : "non-git"}
                      </span>
                    </td>
                    <td>
                      {lastRun ? (
                        <span className={`badge badge-${lastRun.status}`}>{lastRun.status}</span>
                      ) : (
                        <span className="muted">never run</span>
                      )}
                    </td>
                    <td>{task.maxParallelWorkers}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
