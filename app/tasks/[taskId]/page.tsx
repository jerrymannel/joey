"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api.ts";
import { HARNESSES, type Harness, type Run, type SimulatedCommand, type Task } from "../../lib/types.ts";

export default function TaskConfigPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = usePromise(params);
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [simulation, setSimulation] = useState<SimulatedCommand | null>(null);
  const [simulating, setSimulating] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [harness, setHarness] = useState<Harness>("pi");
  const [cliParams, setCliParams] = useState("");
  const [model, setModel] = useState("");
  const [schedule, setSchedule] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  function load() {
    api
      .get<Task>(`/api/tasks/${taskId}`)
      .then((t) => {
        setTask(t);
        setPrompt(t.prompt);
        setHarness(t.harness);
        setCliParams(t.cliParams);
        setModel(t.model);
        setSchedule(t.schedule ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    api.get<Run[]>(`/api/tasks/${taskId}/runs`).then(setRuns);
  }

  useEffect(load, [taskId]);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    setError(null);
    try {
      const updated = await api.patch<Task>(`/api/tasks/${taskId}`, {
        prompt,
        harness,
        cliParams,
        model,
        schedule: schedule || null,
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
      </div>
      <p className="muted">{task.folderPath}</p>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h3>Configuration</h3>
        <form onSubmit={saveConfig}>
          <div className="field">
            <label>Prompt / instructions</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what the agent should do…"
            />
          </div>
          <div className="field">
            <label>Harness</label>
            <select value={harness} onChange={(e) => setHarness(e.target.value as Harness)}>
              {HARNESSES.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            {harness === "adk" && <p className="muted">"adk" isn't wired up to run yet.</p>}
          </div>
          <div className="field">
            <label>CLI params (extra flags passed to the harness, if needed)</label>
            <input value={cliParams} onChange={(e) => setCliParams(e.target.value)} placeholder="--no-tools" />
          </div>
          <div className="field">
            <label>Model (forced via --model / env var)</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-5" />
          </div>
          <div className="field">
            <label>Schedule (5-field cron, blank = manual only)</label>
            <input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="0 * * * *" />
          </div>
          <button type="submit" disabled={savingConfig}>
            {savingConfig ? "Saving…" : "Save Configuration"}
          </button>
        </form>
      </div>

      <h2>Runs</h2>
      <div className="card">
        <div className="row-between" style={{ marginBottom: runs?.length ? 12 : 0 }}>
          <span className="muted">
            {hasActiveRun ? "A run is currently active for this task." : "No active run."}
          </span>
          <span className="row">
            <button className="secondary" onClick={simulate} disabled={simulating} type="button">
              {simulating ? "Simulating…" : simulation ? "Hide Simulation" : "Simulate"}
            </button>
            <button onClick={startRun} disabled={starting || hasActiveRun}>
              {starting ? "Starting…" : "Start Run"}
            </button>
          </span>
        </div>
        {simulation && (
          <div className="field">
            <label>Command a run would execute (preview only, nothing is run)</label>
            <pre className="artifact">
              cwd: {simulation.cwd}
              {"\n"}
              {simulation.command}
            </pre>
          </div>
        )}
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
