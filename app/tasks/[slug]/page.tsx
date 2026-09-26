"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../lib/api.ts";
import type { Simulation, StepDef, TaskDetail, TaskRun } from "../../lib/types.ts";
import { duration, timeout, when } from "../../lib/format.ts";

function StepSummary({ step, steps }: { step: StepDef; steps: StepDef[] }) {
  if (step.kind === "script") {
    const params = Object.entries(step.params);
    return (
      <>
        <strong>script</strong> {step.script}
        {params.length > 0 && <div className="muted">{params.map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ")}</div>}
      </>
    );
  }
  const reviewed = step.reviews === undefined ? null : steps[step.reviews];
  return (
    <>
      <strong>agent</strong> {step.agent}
      {reviewed?.kind === "agent" && (
        <span className="muted">
          {" "}
          — reviews step {step.reviews! + 1} ({reviewed.agent}), up to {step.maxRounds} round{step.maxRounds === 1 ? "" : "s"}
        </span>
      )}
      {step.instructionFile ? (
        <div className="muted">
          instruction from <Link href={`/library/prompts#${encodeURIComponent(step.instructionFile)}`}>prompts/{step.instructionFile}</Link>
        </div>
      ) : (
        <div style={{ whiteSpace: "pre-wrap" }}>{step.instruction}</div>
      )}
    </>
  );
}

function SimulateModal({ sim, onClose }: { sim: Simulation; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: "90%", maxHeight: "85vh", overflow: "auto" }}>
        <div className="page-header" style={{ marginTop: 0 }}>
          <h3 style={{ margin: 0 }}>Simulated run</h3>
          <button type="button" className="secondary" onClick={onClose}>Close</button>
        </div>
        <p className="muted">The herdr and pi commands a run would issue — nothing is run. Run folder: {sim.runDir}</p>
        {sim.steps.map((s, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <strong>{s.label}</strong>
            <pre className="artifact" style={{ whiteSpace: "pre-wrap" }}>{s.commands.join("\n\n")}</pre>
          </div>
        ))}
        <ul className="muted" style={{ fontSize: 12, paddingLeft: 18 }}>{sim.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </div>
    </div>
  );
}

export default function TaskViewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = usePromise(params);
  const router = useRouter();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [runs, setRuns] = useState<TaskRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState<Simulation | null>(null);

  const loadRuns = () => api.get<TaskRun[]>(`/api/tasks/${slug}/runs`).then(setRuns).catch(() => setRuns([]));
  useEffect(() => {
    api.get<TaskDetail>(`/api/tasks/${slug}`).then(setDetail).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    loadRuns();
  }, [slug]);

  const running = (runs ?? []).some((r) => r.status === "running");
  // Poll while a run is going so its status updates without a refresh.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(loadRuns, 3000);
    return () => clearInterval(timer);
  }, [running, slug]);

  async function startRun() {
    setBusy(true);
    setError(null);
    try {
      const { runId } = await api.post<{ runId: string }>(`/api/tasks/${slug}/runs`);
      router.push(`/runs/${runId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to start the run");
      setBusy(false);
    }
  }

  async function simulate() {
    setBusy(true);
    setError(null);
    try {
      setSim(await api.get<Simulation>(`/api/tasks/${slug}/simulate`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to simulate the task");
    } finally {
      setBusy(false);
    }
  }

  async function togglePaused() {
    if (!detail) return;
    setBusy(true);
    try {
      const { paused } = await api.patch<{ paused: boolean }>(`/api/tasks/${slug}`, { paused: !detail.paused });
      setDetail({ ...detail, paused });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to change the task");
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  const { task } = detail;

  return (
    <>
      <p className="crumb">
        <Link href="/tasks">← Tasks</Link>
      </p>
      <div className="page-header">
        <h1>{task?.name ?? slug}</h1>
        <span className="row">
          {task?.schedule && (
            <button type="button" className="secondary" onClick={togglePaused} disabled={busy}>
              {detail.paused ? "Resume schedule" : "Pause schedule"}
            </button>
          )}
          <button type="button" className="secondary" onClick={simulate} disabled={busy || !task}>
            Simulate
          </button>
          <button type="button" onClick={startRun} disabled={busy || running || !task}>
            {running ? "Running…" : "Start run"}
          </button>
        </span>
      </div>

      {sim && <SimulateModal sim={sim} onClose={() => setSim(null)} />}

      {error && <div className="error-banner">{error}</div>}
      {detail.errors.length > 0 && (
        <div className="error-banner">
          <strong>tasks/{slug}.yaml can&apos;t run until these are fixed:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {detail.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="field">
          <label>File</label>
          <p style={{ margin: 0 }}>tasks/{slug}.yaml</p>
        </div>
        <div className="field">
          <label>Schedule</label>
          <p style={{ margin: 0 }}>
            {task?.schedule ?? "Manual only"}
            {task?.schedule && detail.paused && <span className="badge badge-paused" style={{ marginLeft: 8 }}>paused</span>}
          </p>
        </div>
      </div>

      {task && (
        <>
          <h2>Agents</h2>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prompt</th>
                  <th>Model</th>
                  <th>Thinking</th>
                  <th>Tools</th>
                  <th>MCP</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(task.agents).map((a) => (
                  <tr key={a.name}>
                    <td>{a.name}</td>
                    <td>
                      <Link href={`/library/prompts#${encodeURIComponent(a.prompt)}`}>{a.prompt}</Link>
                    </td>
                    <td>{a.model}</td>
                    <td className="muted">{a.thinking || "default"}</td>
                    <td className="muted">{a.tools.join(", ") || "—"}</td>
                    <td className="muted">{a.mcp.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Steps</h2>
          <div className="card">
            <table>
              <tbody>
                {task.steps.map((step, i) => (
                  <tr key={i}>
                    <td className="muted" style={{ width: 32, verticalAlign: "top" }}>
                      {i + 1}
                    </td>
                    <td>
                      <StepSummary step={step} steps={task.steps} />
                    </td>
                    <td className="muted" style={{ width: 90, verticalAlign: "top" }}>
                      {timeout(step.timeoutMs)} max
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <details className="card">
        <summary className="muted">tasks/{slug}.yaml</summary>
        <pre className="artifact">{detail.source}</pre>
      </details>

      <h2>Runs</h2>
      <div className="card">
        {runs === null ? (
          <p className="muted">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="empty-state">No runs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Took</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="clickable" onClick={() => router.push(`/runs/${run.id}`)}>
                  <td>{when(run.startedAt)}</td>
                  <td className="muted">{duration(run.startedAt, run.endedAt)}</td>
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
