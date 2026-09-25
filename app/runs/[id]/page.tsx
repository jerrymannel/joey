"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { api } from "../../lib/api.ts";
import type { RunDetail } from "../../lib/types.ts";
import { duration, when } from "../../lib/format.ts";

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get<RunDetail>(`/api/runs/${id}`).then(setDetail).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  useEffect(() => {
    load();
  }, [id]);

  const running = detail?.run.status === "running";
  // Poll while the run is going — each step's status and output show up as it finishes.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [id, running]);

  if (!detail) return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  const { run, steps, result } = detail;

  return (
    <>
      <p className="crumb">
        <Link href={`/tasks/${run.taskSlug}`}>← {run.taskSlug}</Link>
      </p>
      <div className="page-header">
        <h1>Run of {run.taskSlug}</h1>
        <span className={`badge badge-${run.status}`}>{run.status}</span>
      </div>

      {run.errorMessage && <div className="error-banner">{run.errorMessage}</div>}

      <div className="card">
        <div className="field">
          <label>Started</label>
          <p style={{ margin: 0 }}>
            {when(run.startedAt)} <span className="muted">· {running ? "running for" : "took"} {duration(run.startedAt, run.endedAt)}</span>
          </p>
        </div>
        <div className="field">
          <label>Run folder</label>
          <p style={{ margin: 0 }}>
            <code>{run.runDir}</code>
          </p>
        </div>
      </div>

      <h2>Steps</h2>
      <div className="card">
        {steps.map((s) => (
          <div key={s.idx} className={`step step-${s.status}`}>
            <div className="row-between">
              <span>
                <strong>{s.idx + 1}.</strong> {s.label}
              </span>
              <span className={`badge badge-${s.status}`}>{s.status}</span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {s.startedAt && duration(s.startedAt, s.endedAt)}
              {s.note && ` · ${s.note}`}
            </div>
            {s.output !== null && (
              <details>
                <summary>Output</summary>
                <pre className="artifact">{s.output || "(empty)"}</pre>
              </details>
            )}
          </div>
        ))}
      </div>

      {result !== null && (
        <>
          <h2>Result</h2>
          <div className="card">
            <pre className="artifact" style={{ maxHeight: "none" }}>
              {result}
            </pre>
          </div>
        </>
      )}

      <h2>Log</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Script output and every agent turn — replies, tool calls (→) and tool results (✓/✗). Agent sessions are kept in the run folder&apos;s sessions/.
        </p>
        <pre className="artifact" style={{ maxHeight: 600 }}>
          {run.log.trim() || "(nothing yet)"}
        </pre>
      </div>
    </>
  );
}
