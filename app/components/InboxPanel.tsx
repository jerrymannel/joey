"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.ts";
import type { MailMessage } from "../lib/types.ts";

/** A task's email address and the mail sent to it, plus a box to mail it as the human. */
export default function InboxPanel({ taskId }: { taskId: string }) {
  const [messages, setMessages] = useState<MailMessage[] | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<{ address: string | null; messages: MailMessage[] }>(`/api/tasks/${taskId}/messages`)
      .then((r) => {
        setAddress(r.address);
        setMessages(r.messages);
        setError(null);
      })
      .catch((err) => {
        setMessages([]);
        setError(err instanceof ApiError ? err.message : "couldn't read the inbox");
      });
  }

  useEffect(load, [taskId]);

  // Delivery happens on the inbox scheduler's tick, so keep the statuses fresh (each refresh is a Gmail search).
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

  const open = messages?.find((m) => m.id === openId) ?? null;

  return (
    <div className="card">
      {error && <div className="error-banner">{error}</div>}
      <p className="muted">
        {address ? (
          <>
            Email this task at <code>{address}</code>
          </>
        ) : (
          "Choose an agent mailbox in General settings to give this task an email address."
        )}
      </p>
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
              <tr key={m.id} className={`clickable ${m.id === openId ? "active" : ""}`} onClick={() => setOpenId(m.id === openId ? null : m.id)}>
                <td>{m.subject || "(no subject)"}</td>
                <td className="muted">{m.fromLabel}</td>
                <td className="muted">{new Date(m.sentAt).toLocaleString()}</td>
                <td>
                  <span className={`badge ${m.unread ? "badge-pending" : "badge-completed"}`}>{m.unread ? "waiting" : "delivered"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && (
        <div className="field" style={{ marginTop: 12 }}>
          <label>
            Hop {open.hops}
          </label>
          <pre className="artifact">{open.body || "(empty)"}</pre>
        </div>
      )}

      <div className="field" style={{ marginTop: 16 }}>
        <label>Send mail</label>
        <input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea placeholder="Message body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} style={{ marginTop: 8 }} />
      </div>
      <button type="button" onClick={send} disabled={sending || !body.trim()}>
        {sending ? "Sending…" : "Send mail"}
      </button>
    </div>
  );
}
