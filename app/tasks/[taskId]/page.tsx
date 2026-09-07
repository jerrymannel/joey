"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api.ts";
import type { AgentRole, Run, Task } from "../../lib/types.ts";
import { RoleEditor } from "../../components/RoleEditor.tsx";

export default function TaskConfigPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = usePromise(params);
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [roles, setRoles] = useState<AgentRole[] | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingRole, setAddingRole] = useState(false);
  const [starting, setStarting] = useState(false);

  const [orchestratorGoal, setOrchestratorGoal] = useState("");
  const [secretsFilePath, setSecretsFilePath] = useState("");
  const [maxParallelWorkers, setMaxParallelWorkers] = useState(3);
  const [savingConfig, setSavingConfig] = useState(false);

  function load() {
    api
      .get<Task>(`/api/tasks/${taskId}`)
      .then((t) => {
        setTask(t);
        setOrchestratorGoal(t.orchestratorGoal);
        setSecretsFilePath(t.secretsFilePath ?? "");
        setMaxParallelWorkers(t.maxParallelWorkers);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    api.get<AgentRole[]>(`/api/tasks/${taskId}/roles`).then(setRoles);
    api.get<Run[]>(`/api/tasks/${taskId}/runs`).then(setRuns);
  }

  useEffect(load, [taskId]);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    setError(null);
    try {
      const updated = await api.patch<Task>(`/api/tasks/${taskId}`, {
        orchestratorGoal,
        secretsFilePath: secretsFilePath || null,
        maxParallelWorkers: Number(maxParallelWorkers),
      });
      setTask(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save task");
    } finally {
      setSavingConfig(false);
    }
  }

  async function startRun() {
    setStarting(true);
    setError(null);
    try {
      const { runId } = await api.post<{ runId: string }>(`/api/tasks/${taskId}/runs`);
      router.push(`/tasks/${taskId}/runs/${runId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to start run");
      load();
    } finally {
      setStarting(false);
    }
  }

  if (!task) {
    return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  }

  const hasActiveRun = (runs ?? []).some((r) => r.status === "pending" || r.status === "running");

  return (
    <>
      <p className="crumb">
        <Link href="/tasks">← Tasks</Link>
      </p>
      <div className="page-header">
        <h1>{task.name}</h1>
        <span className={`badge ${task.isGitRepo ? "badge-git" : "badge-nongit"}`}>
          {task.isGitRepo ? "git" : "non-git"}
        </span>
      </div>
      <p className="muted">{task.folderPath}</p>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h3>Configuration</h3>
        <form onSubmit={saveConfig}>
          <div className="field">
            <label>Orchestrator goal</label>
            <textarea
              value={orchestratorGoal}
              onChange={(e) => setOrchestratorGoal(e.target.value)}
              placeholder="Describe what the orchestrator should accomplish for this task…"
            />
          </div>
          <div className="field">
            <label>Secrets file path (.env-style, edited outside the app)</label>
            <input value={secretsFilePath} onChange={(e) => setSecretsFilePath(e.target.value)} />
          </div>
          <div className="field">
            <label>Max parallel workers{!task.isGitRepo && " (forced to 1 for non-git tasks)"}</label>
            <input
              type="number"
              min={1}
              value={maxParallelWorkers}
              disabled={!task.isGitRepo}
              onChange={(e) => setMaxParallelWorkers(Number(e.target.value))}
            />
          </div>
          <button type="submit" disabled={savingConfig}>
            {savingConfig ? "Saving…" : "Save Configuration"}
          </button>
        </form>
      </div>

      <h2>Roles</h2>
      {roles === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {roles.map((role) => (
            <RoleEditor
              key={role.id}
              taskId={taskId}
              role={role}
              onSaved={(saved) => setRoles((rs) => (rs ?? []).map((r) => (r.id === saved.id ? saved : r)))}
              onDeleted={(id) => setRoles((rs) => (rs ?? []).filter((r) => r.id !== id))}
            />
          ))}
          {addingRole ? (
            <RoleEditor
              taskId={taskId}
              role={null}
              onSaved={(created) => {
                setRoles((rs) => [...(rs ?? []), created]);
                setAddingRole(false);
              }}
              onCancel={() => setAddingRole(false)}
            />
          ) : (
            <button className="secondary" onClick={() => setAddingRole(true)}>
              + Add Role
            </button>
          )}
        </>
      )}

      <h2>Runs</h2>
      <div className="card">
        <div className="row-between" style={{ marginBottom: runs?.length ? 12 : 0 }}>
          <span className="muted">
            {hasActiveRun ? "A run is currently active for this task." : "No active run."}
          </span>
          <button onClick={startRun} disabled={starting || hasActiveRun}>
            {starting ? "Starting…" : "Start Run"}
          </button>
        </div>
        {runs === null ? (
          <p className="muted">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="empty-state">No runs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  className="clickable"
                  onClick={() => router.push(`/tasks/${taskId}/runs/${run.id}`)}
                >
                  <td>{new Date(run.startedAt).toLocaleString()}</td>
                  <td>
                    <span className={`badge badge-${run.status}`}>{run.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
