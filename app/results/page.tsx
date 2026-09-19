"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "../lib/api.ts";
import type { MailMessage, ResultMessage, Run } from "../lib/types.ts";

/** One table row: a run result (file) or an email from the agent inbox. */
interface Row {
  key: string;
  kind: "result" | "email";
  subject: string;
  fromId: string;
  fromLabel: string;
  /** Set on a result that handed the work to another agent instead of closing. */
  toId: string;
  toLabel: string;
  sentAt: string | null;
  run: string;
  body: string;
}

const fromResult = (m: ResultMessage): Row => ({ ...m, key: `r:${m.file}`, kind: "result", toId: m.to });
const fromMail = (m: MailMessage): Row => ({ ...m, key: `m:${m.id}`, kind: "email", toId: "", toLabel: "" });

/** Run results (files) and the agent inbox's emails, newest first, with a way to read the run log a row is linked to. Read-only, so a plain table rather than the CRUD pattern. */
export default function ResultsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mailError, setMailError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [log, setLog] = useState<Run | null | "loading">(null);

  useEffect(() => {
    Promise.all([
      api.get<ResultMessage[]>("/api/results").catch(() => []),
      api.get<MailMessage[]>("/api/mail").catch((err) => {
        setMailError(err instanceof ApiError ? err.message : "couldn't read the agent inbox");
        return [];
      }),
    ]).then(([results, mail]) =>
      setRows([...results.map(fromResult), ...mail.map(fromMail)].sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""))),
    );
  }, []);

  const open = rows?.find((r) => r.key === openKey) ?? null;

  function select(r: Row) {
    setOpenKey(r.key === openKey ? null : r.key);
    setLog(null);
  }

  function readLog(r: Row) {
    setLog("loading");
    api
      .get<Run>(`/api/tasks/${r.fromId}/runs/${r.run}`)
      .then(setLog)
      .catch(() => setLog(null));
  }

  return (
    <>
      <div className="page-header">
        <h1>Results</h1>
      </div>
      <p className="muted">Each run ends with an email: its result, or a hand-off to another agent. Also the other mail in the agent inbox.</p>
      {mailError && <div className="error-banner">Agent inbox: {mailError}</div>}

      <div className="split-layout">
        <div className="card">
          {rows === null ? (
            <p className="muted">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="empty-state">No results yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Type</th>
                  <th>From</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={`clickable ${r.key === openKey ? "active" : ""}`} onClick={() => select(r)}>
                    <td>{r.subject || "(no subject)"}</td>
                    <td>
                      <span className={`badge ${r.kind === "result" ? "badge-completed" : "badge-pending"}`}>{r.toId ? "hand-off" : r.kind}</span>
                    </td>
                    <td className="muted">{r.fromLabel}</td>
                    <td className="muted">{r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          {!open ? (
            <p className="muted">Click a row to read it.</p>
          ) : (
            <div className="card">
              <div className="row-between">
                <h3 style={{ margin: 0 }}>{open.subject || "(no subject)"}</h3>
                {open.fromId && open.run && log === null && (
                  <button type="button" className="secondary" onClick={() => readLog(open)}>
                    Read log
                  </button>
                )}
              </div>
              <p className="muted">
                From {open.fromId ? <Link href={`/tasks/${open.fromId}`}>{open.fromLabel}</Link> : open.fromLabel}
                {open.toId && (
                  <>
                    {" "}
                    → handed off to <Link href={`/tasks/${open.toId}`}>{open.toLabel}</Link>
                  </>
                )}
                {open.run && <> · run {open.run.slice(0, 8)}</>}
              </p>
              <pre className="artifact">{open.body || "(empty)"}</pre>
              {log === "loading" && <p className="muted">Loading log…</p>}
              {log && log !== "loading" && (
                <div className="field" style={{ marginTop: 12 }}>
                  <label>
                    Log · run {log.id.slice(0, 8)} · {log.status}
                  </label>
                  <pre className="artifact">{log.output || "(no output)"}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
