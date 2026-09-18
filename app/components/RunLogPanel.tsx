"use client";

import { useState } from "react";
import { api } from "../lib/api.ts";
import type { Run } from "../lib/types.ts";

/** Runs are append-only and never user-edited, so this stays a plain table rather than the DataGrid CRUD pattern. */
export default function RunLogPanel({ taskId, runs }: { taskId: string; runs: Run[] | null }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<string[] | null>(null);

  const selectedRun = runs?.find((r) => r.id === selectedRunId) ?? null;

  function openRun(run: Run) {
    setSelectedRunId(run.id);
    setArtifacts(null);
    api
      .get<string[]>(`/api/tasks/${taskId}/runs/${run.id}/artifacts`)
      .then(setArtifacts)
      .catch(() => setArtifacts([]));
  }

  return (
    <div className="split-layout">
      <div className="card">
        {runs === null ? (
          <p className="muted">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="empty-state">No runs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Started</th>
                <th>Completed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className={`clickable ${run.id === selectedRunId ? "active" : ""}`} onClick={() => openRun(run)}>
                  <td className="muted">{run.id.slice(0, 8)}</td>
                  <td className="muted">{new Date(run.startedAt).toLocaleString()}</td>
                  <td className="muted">{run.endedAt ? new Date(run.endedAt).toLocaleString() : "—"}</td>
                  <td>
                    <span className={`badge badge-${run.status}`}>{run.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        {!selectedRun ? (
          <p className="muted">Click a run to see its details.</p>
        ) : (
          <div className="card">
            <div className="row-between">
              <h3 style={{ margin: 0 }}>Run {selectedRun.id.slice(0, 8)}</h3>
              <span className={`badge badge-${selectedRun.status}`}>{selectedRun.status}</span>
            </div>
            {selectedRun.errorMessage && <div className="error-banner">{selectedRun.errorMessage}</div>}

            <div className="field">
              <label>Artifacts (workspace folder contents)</label>
              {artifacts === null ? (
                <p className="muted">Loading…</p>
              ) : artifacts.length === 0 ? (
                <p className="muted">No files.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {artifacts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="field">
              <label>Logs</label>
              <pre className="artifact">{selectedRun.output || "(no output yet)"}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
