"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import Link from "next/link";
import type { ResultMessage, Run } from "../lib/types.ts";

/** Runs are append-only and never user-edited, so this stays a plain table rather than the DataGrid CRUD pattern. */
/** `withResults` is off for gmail/youtube automations — they write files, not an agent result. */
export default function RunLogPanel({ taskId, runs, withResults = true }: { taskId: string; runs: Run[] | null; withResults?: boolean }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<string[] | null>(null);
  const [results, setResults] = useState<ResultMessage[]>([]);

  const selectedRun = runs?.find((r) => r.id === selectedRunId) ?? null;
  const result = results.find((m) => m.run === selectedRunId);

  function openRun(run: Run) {
    setSelectedRunId(run.id);
    setArtifacts(null);
    api
      .get<string[]>(`/api/tasks/${taskId}/runs/${run.id}/artifacts`)
      .then(setArtifacts)
      .catch(() => setArtifacts([]));
  }

  // Re-read when the selected run's status changes — the agent files its result just before the run completes.
  const selectedStatus = selectedRun?.status;
  useEffect(() => {
    if (withResults && selectedRunId) api.get<ResultMessage[]>(`/api/results?taskId=${taskId}`).then(setResults).catch(() => setResults([]));
  }, [taskId, withResults, selectedRunId, selectedStatus]);

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
              <label>Artifacts (task folder contents)</label>
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

            {withResults && (
            <div className="field">
              <label>Result</label>
              {result ? (
                <>
                  <p style={{ margin: "0 0 6px" }}>
                    {result.subject || "(no subject)"} · <Link href="/results">Open in Results</Link>
                  </p>
                  <pre className="artifact">{result.body || "(empty)"}</pre>
                </>
              ) : (
                <p className="muted">{selectedRun.status === "running" || selectedRun.status === "pending" ? "Not sent yet." : "No result was sent."}</p>
              )}
            </div>
            )}

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
