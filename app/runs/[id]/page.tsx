"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import Link from "next/link";
import { api } from "../../lib/api.ts";
import type { RunDetail } from "../../lib/types.ts";
import { duration, when } from "../../lib/format.ts";

/** Live logs for one step over SSE (`/api/runs/[id]/steps/[idx]/stream`) — the step's .log as it grows, until the step ends. */
function StepStream({ runId, idx, onClose }: { runId: string; idx: number; onClose: () => void }) {
  const [text, setText] = useState("");
  const [live, setLive] = useState(true);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/runs/${runId}/steps/${idx}/stream`);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data) as { text?: string; done?: string; error?: string };
      if (msg.text) setText((t) => t + msg.text);
      if (msg.done !== undefined || msg.error) {
        setLive(false);
        es.close();
      }
    };
    es.onerror = () => {
      setLive(false);
      es.close();
    };
    return () => es.close();
  }, [runId, idx]);

  useEffect(() => {
    preRef.current?.scrollTo(0, preRef.current.scrollHeight);
  }, [text]);

  return (
    <div style={{ marginTop: 6 }}>
      <div className="row-between">
        <span className="muted" style={{ fontSize: 12 }}>{live ? "● live" : "ended"}</span>
        <button type="button" className="secondary" onClick={onClose}>Close</button>
      </div>
      <pre ref={preRef} className="artifact" style={{ maxHeight: 320, overflow: "auto" }}>{text || "(waiting for output…)"}</pre>
    </div>
  );
}

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectedStep, setConnectedStep] = useState<number | null>(null);

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
              <span className="row">
                {s.status === "running" && connectedStep !== s.idx && (
                  <button type="button" className="secondary" onClick={() => setConnectedStep(s.idx)}>Connect</button>
                )}
                <span className={`badge badge-${s.status}`}>{s.status}</span>
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {s.startedAt && duration(s.startedAt, s.endedAt)}
              {s.note && ` · ${s.note}`}
            </div>
            {connectedStep === s.idx && <StepStream runId={id} idx={s.idx} onClose={() => setConnectedStep(null)} />}
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

      {detail.conversation && (
        <>
          <h2>Conversation</h2>
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>
              What agents posted via <code>agent_message</code> / <code>agent_done</code> — the run folder&apos;s <code>conversation.md</code>.
            </p>
            <pre className="artifact" style={{ maxHeight: 400 }}>{detail.conversation.trim()}</pre>
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
