"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../lib/api.ts";
import type { Run, SimulatedCommand, Task, ToolDef } from "../../lib/types.ts";
import RunLogPanel from "../../components/RunLogPanel.tsx";
import ConfirmModal from "../../components/ConfirmModal.tsx";

export default function TaskViewPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = usePromise(params);
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [simulation, setSimulation] = useState<SimulatedCommand | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function load() {
    api
      .get<Task>(`/api/tasks/${taskId}`)
      .then(setTask)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    api.get<Run[]>(`/api/tasks/${taskId}/runs`).then(setRuns).catch(() => setRuns([]));
    api.get<ToolDef[]>("/api/tools").then(setTools).catch(() => {});
  }

  useEffect(load, [taskId]);

  // Poll while a run is in flight so its status/logs update without a manual refresh.
  useEffect(() => {
    const hasActive = (runs ?? []).some((r) => r.status === "pending" || r.status === "running");
    if (!hasActive) return;
    const timer = setInterval(() => api.get<Run[]>(`/api/tasks/${taskId}/runs`).then(setRuns).catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [runs, taskId]);

  async function startRun() {
    setStarting(true);
    setError(null);
    try {
      await api.post(`/api/tasks/${taskId}/runs`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to start run");
    } finally {
      setStarting(false);
    }
  }

  async function simulate() {
    if (simulation) {
      setSimulation(null);
      return;
    }
    setSimulating(true);
    setError(null);
    try {
      setSimulation(await api.get<SimulatedCommand>(`/api/tasks/${taskId}/simulate`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to simulate run");
    } finally {
      setSimulating(false);
    }
  }

  async function confirmDelete() {
    await api.del(`/api/tasks/${taskId}`);
    router.push("/tasks");
  }

  if (!task) {
    return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  }

  const hasActiveRun = (runs ?? []).some((r) => r.status === "pending" || r.status === "running");
  const toolNames = tools.filter((t) => task.toolIds.includes(t.id)).map((t) => t.name);

  return (
    <>
      <p className="crumb">
        <Link href="/tasks">← Tasks</Link>
      </p>
      <div className="page-header">
        <h1>{task.name}</h1>
        <span className="row">
          <button type="button" className="secondary" onClick={() => router.push(`/tasks/${taskId}/edit`)}>
            Edit
          </button>
          <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        </span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="field">
          <label>Folder</label>
          <p style={{ margin: 0 }}>{task.folderPath}</p>
        </div>
        <div className="field">
          <label>Prompt / instructions</label>
          <pre className="artifact">{task.prompt || "(none)"}</pre>
        </div>
        <div className="field">
          <label>Harness</label>
          <p style={{ margin: 0 }}>
            {task.harness}
            {task.harness === "adk" && <span className="muted"> — not wired up to run yet</span>}
          </p>
        </div>
        {task.cliParams && (
          <div className="field">
            <label>CLI params</label>
            <p style={{ margin: 0 }}>{task.cliParams}</p>
          </div>
        )}
        <div className="field">
          <label>Model</label>
          <p style={{ margin: 0 }}>{task.model || "Default"}</p>
        </div>
        {toolNames.length > 0 && (
          <div className="field">
            <label>Tools</label>
            <p style={{ margin: 0 }}>{toolNames.join(", ")}</p>
          </div>
        )}
        {task.harness === "pi" && (
          <>
            <div className="field">
              <label>Thinking level</label>
              <p style={{ margin: 0 }}>{task.thinkingLevel || "Default"}</p>
            </div>
            <div className="field">
              <label>Trust folder</label>
              <p style={{ margin: 0 }}>{task.trustFolder ? "Yes — pi skips permission prompts" : "No"}</p>
            </div>
          </>
        )}
        <div className="field">
          <label>Schedule</label>
          <p style={{ margin: 0 }}>{task.schedule ?? "Manual only"}</p>
        </div>

        <div className="row-between">
          <span className="muted">{hasActiveRun ? "A run is currently active for this task." : "No active run."}</span>
          <span className="row">
            <button className="secondary" onClick={simulate} disabled={simulating} type="button">
              {simulating ? "Simulating…" : simulation ? "Hide simulation" : "Simulate"}
            </button>
            <button onClick={startRun} disabled={starting || hasActiveRun}>
              {starting ? "Starting…" : "Start run"}
            </button>
          </span>
        </div>
        {simulation && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Commands a run would execute (preview only, nothing is run)</label>
            <pre className="artifact">
              cwd: {simulation.cwd}
              {"\n\n"}
              {simulation.commands.join("\n")}
            </pre>
          </div>
        )}
      </div>

      <h2>Runs</h2>
      <RunLogPanel taskId={taskId} runs={runs} />

      {confirmingDelete && (
        <ConfirmModal
          title="Delete task?"
          message={`"${task.name}" and its run history will be permanently deleted.`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}
