"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "../lib/api.ts";
import type { RunDetail, UserQuestion } from "../lib/types.ts";
import { duration, when } from "../lib/format.ts";
import Markdown from "./Markdown.tsx";

type RunTab = "result" | "steps" | "logs";

/** The form shown while a run is parked on agent_user_input: pick an option (or type your own) and answer, which resumes the run. */
function AnswerForm({ runId, question, onAnswered }: { runId: string; question: UserQuestion; onAnswered: () => void }) {
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: string) {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/runs/${runId}/answer`, { choice: value.trim(), note: note.trim() || undefined });
      onAnswered();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to send the answer");
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ borderColor: "var(--accent, #6366f1)" }}>
      <div className="page-header" style={{ marginTop: 0 }}>
        <h2 style={{ margin: 0 }}>Waiting for your input</h2>
        <span className="muted">asked by {question.agent}</span>
      </div>
      <p style={{ whiteSpace: "pre-wrap", marginTop: 0 }}>{question.question}</p>
      {question.options.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {question.options.map((o) => (
            <button key={o} type="button" className="secondary" disabled={busy} onClick={() => submit(o)}>{o}</button>
          ))}
        </div>
      )}
      <div className="field">
        <label>{question.options.length > 0 ? "…or your own answer" : "Your answer"}</label>
        <input value={choice} onChange={(e) => setChoice(e.target.value)} placeholder="Type an answer" />
      </div>
      <div className="field">
        <label>Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to add" />
      </div>
      {error && <div className="error-banner">{error}</div>}
      <button type="button" disabled={busy || !choice.trim()} onClick={() => submit(choice)}>{busy ? "Sending…" : "Send answer"}</button>
    </div>
  );
}

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

/** The run detail view — used standalone at /runs/[id] and embedded in the task page's Runs tab. */
export default function RunView({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectedStep, setConnectedStep] = useState<number | null>(null);
  const [tab, setTab] = useState<RunTab>("steps");

  const load = () => api.get<RunDetail>(`/api/runs/${id}`).then(setDetail).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  useEffect(() => {
    setDetail(null);
    setError(null);
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
      {!embedded && (
        <p className="crumb">
          <Link href={`/tasks/${run.taskSlug}`}>← {run.taskSlug}</Link>
        </p>
      )}
      <div className="page-header">
        <h1>Run of {run.taskSlug}</h1>
        <span className={`badge badge-${run.status}`}>{run.status}</span>
      </div>

      {run.errorMessage && <div className="error-banner">{run.errorMessage}</div>}

      {detail.question && <AnswerForm runId={id} question={detail.question} onAnswered={load} />}

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

      <div className="tabs">
        <button type="button" className={`tab ${tab === "result" ? "active" : ""}`} onClick={() => setTab("result")}>Result</button>
        <button type="button" className={`tab ${tab === "steps" ? "active" : ""}`} onClick={() => setTab("steps")}>Steps</button>
        <button type="button" className={`tab ${tab === "logs" ? "active" : ""}`} onClick={() => setTab("logs")}>Logs</button>
      </div>

      {tab === "result" && (
        <div className="card">
          {result !== null ? <Markdown>{result}</Markdown> : <p className="empty-state" style={{ margin: 0 }}>No result yet.</p>}
        </div>
      )}

      {tab === "steps" && (
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
      )}

      {tab === "logs" && (
        <>
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>
              Script output and every agent turn — replies, tool calls (→) and tool results (✓/✗). Agent sessions are kept in the run folder&apos;s sessions/.
            </p>
            <pre className="artifact" style={{ maxHeight: 600 }}>
              {run.log.trim() || "(nothing yet)"}
            </pre>
          </div>
          {detail.conversation && (
            <div className="card">
              <p className="muted" style={{ marginTop: 0 }}>
                Conversation — what agents posted via <code>agent_message</code> / <code>agent_done</code> (the run folder&apos;s <code>conversation.md</code>).
              </p>
              <Markdown>{detail.conversation.trim()}</Markdown>
            </div>
          )}
        </>
      )}
    </>
  );
}
