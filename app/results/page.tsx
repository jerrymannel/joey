"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api.ts";
import type { MailMessage, Run } from "../lib/types.ts";

/** The RESULTS mailbox: each run's final output, with a way to read the run log it's linked to. Read-only, so a plain table rather than the CRUD pattern. */
export default function ResultsPage() {
  const [results, setResults] = useState<MailMessage[] | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [log, setLog] = useState<Run | null | "loading">(null);

  useEffect(() => {
    api.get<MailMessage[]>("/api/results").then(setResults).catch(() => setResults([]));
  }, []);

  const open = results?.find((m) => m.file === openFile) ?? null;

  function select(m: MailMessage) {
    setOpenFile(m.file === openFile ? null : m.file);
    setLog(null);
  }

  function readLog(m: MailMessage) {
    setLog("loading");
    api
      .get<Run>(`/api/tasks/${m.from}/runs/${m.run}`)
      .then(setLog)
      .catch(() => setLog(null));
  }

  return (
    <>
      <div className="page-header">
        <h1>Results</h1>
      </div>
      <p className="muted">The final output of each run, filed by the agent when it finished.</p>

      <div className="split-layout">
        <div className="card">
          {results === null ? (
            <p className="muted">Loading…</p>
          ) : results.length === 0 ? (
            <p className="empty-state">No results yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>From</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {results.map((m) => (
                  <tr key={m.file} className={`clickable ${m.file === openFile ? "active" : ""}`} onClick={() => select(m)}>
                    <td>{m.subject || "(no subject)"}</td>
                    <td className="muted">{m.fromName}</td>
                    <td className="muted">{m.sentAt ? new Date(m.sentAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          {!open ? (
            <p className="muted">Click a result to read it.</p>
          ) : (
            <div className="card">
              <div className="row-between">
                <h3 style={{ margin: 0 }}>{open.subject || "(no subject)"}</h3>
                {open.run && log === null && (
                  <button type="button" className="secondary" onClick={() => readLog(open)}>
                    Read log
                  </button>
                )}
              </div>
              <p className="muted">
                From <Link href={`/tasks/${open.from}`}>{open.fromName}</Link>
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
