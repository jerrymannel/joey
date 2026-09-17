"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api.ts";
import type { Run, Task } from "../../../../lib/types.ts";

const POLL_MS = 3000;

export default function RunMonitorPage({
  params,
}: {
  params: Promise<{ taskId: string; runId: string }>;
}) {
  const { taskId, runId } = usePromise(params);
  const [task, setTask] = useState<Task | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.get<Task>(`/api/tasks/${taskId}`).then(setTask);
  }, [taskId]);

  useEffect(() => {
    function poll() {
      api
        .get<Run>(`/api/tasks/${taskId}/runs/${runId}`)
        .then((r) => {
          setRun(r);
          setError(null);
          if (r.status !== "pending" && r.status !== "running" && timer.current) {
            clearInterval(timer.current);
            timer.current = null;
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }
    poll();
    timer.current = setInterval(poll, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [taskId, runId]);

  if (!run) {
    return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  }

  return (
    <>
      <p className="crumb">
        <Link href="/tasks">Tasks</Link> / <Link href={`/tasks/${taskId}`}>{task?.name ?? taskId}</Link>
      </p>
      <div className="page-header">
        <h1>Run {run.id.slice(0, 8)}</h1>
        <span className={`badge badge-${run.status}`}>{run.status}</span>
      </div>
      <p className="muted">Started {new Date(run.startedAt).toLocaleString()}</p>

      {run.status === "failed" && run.errorMessage && <div className="error-banner">{run.errorMessage}</div>}
      {error && <div className="error-banner">{error}</div>}

      <h2>Output</h2>
      <div className="card">
        <pre className="artifact">{run.output || "(no output yet)"}</pre>
      </div>
    </>
  );
}
