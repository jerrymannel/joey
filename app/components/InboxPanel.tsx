"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.ts";
import type { MailMessage } from "../lib/types.ts";

/** A task's mailbox (INBOX + DONE files addressed to it) plus a box to drop a `from: human` message in. */
export default function InboxPanel({ taskId }: { taskId: string }) {
  const [messages, setMessages] = useState<MailMessage[] | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<MailMessage[]>(`/api/tasks/${taskId}/messages`).then(setMessages).catch(() => setMessages([]));
  }

  useEffect(load, [taskId]);

  // Delivery happens on the inbox scheduler's tick, so keep the statuses fresh.
  useEffect(() => {
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [taskId]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      await api.post(`/api/tasks/${taskId}/messages`, { subject, body });
      setSubject("");
      setBody("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to send message");
    } finally {
      setSending(false);
    }
  }

  const open = messages?.find((m) => m.file === openFile) ?? null;

  return (
    <div className="card">
      {error && <div className="error-banner">{error}</div>}
      {messages === null ? (
        <p className="muted">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="empty-state">No messages.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>From</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.file} className={`clickable ${m.file === openFile ? "active" : ""}`} onClick={() => setOpenFile(m.file === openFile ? null : m.file)}>
                <td>{m.subject || "(no subject)"}</td>
                <td className="muted">{m.fromName}</td>
                <td className="muted">{m.sentAt ? new Date(m.sentAt).toLocaleString() : "—"}</td>
                <td>
                  <span className={`badge ${m.status === "inbox" ? "badge-pending" : "badge-completed"}`}>{m.status === "inbox" ? "waiting" : "delivered"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && (
        <div className="field" style={{ marginTop: 12 }}>
          <label>
            Thread {open.thread} · hop {open.hops}
          </label>
          <pre className="artifact">{open.body || "(empty)"}</pre>
        </div>
      )}

      <div className="field" style={{ marginTop: 16 }}>
        <label>Send message</label>
        <input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea placeholder="Message body (markdown)" rows={3} value={body} onChange={(e) => setBody(e.target.value)} style={{ marginTop: 8 }} />
      </div>
      <button type="button" onClick={send} disabled={sending || !body.trim()}>
        {sending ? "Sending…" : "Send message"}
      </button>
    </div>
  );
}
