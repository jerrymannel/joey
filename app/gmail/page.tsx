"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "../lib/api.ts";
import type { EmailDetail, EmailSummary, GmailStatus } from "../lib/types.ts";

export default function GmailPage() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [account, setAccount] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EmailSummary[] | null>(null);
  const [selected, setSelected] = useState<EmailDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<GmailStatus>("/api/settings/gmail").then((s) => {
      const emails = s.accounts.map((a) => a.email);
      setAccounts(emails);
      setAccount(emails[0] ?? "");
    });
  }, []);

  function withAccount(url: string): string {
    if (!account) return url;
    return `${url}${url.includes("?") ? "&" : "?"}account=${encodeURIComponent(account)}`;
  }

  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      setResults(await api.get<EmailSummary[]>(withAccount(`/api/gmail/search?q=${encodeURIComponent(query)}`)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "search failed");
    } finally {
      setLoading(false);
    }
  }

  async function open(id: string) {
    setError(null);
    try {
      const email = await api.get<EmailDetail>(withAccount(`/api/gmail/messages/${id}`));
      setSelected(email);
      setDraftTo(email.from);
      setDraftSubject(email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`);
      setDraftBody("");
      setDraftSaved(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to open email");
    }
  }

  async function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    setSavingDraft(true);
    setError(null);
    setDraftSaved(null);
    try {
      const draft = await api.post<{ id: string }>("/api/gmail/drafts", {
        to: draftTo,
        subject: draftSubject,
        body: draftBody,
        account: account || undefined,
      });
      setDraftSaved(`Draft saved (id: ${draft.id}) — not sent.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save draft");
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Gmail</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {accounts.length > 1 && (
        <div className="card">
          <label htmlFor="account">Account</label>
          <select id="account" value={account} onChange={(e) => setAccount(e.target.value)}>
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="card">
        <form onSubmit={search} className="row">
          <input
            placeholder="Search, e.g. from:someone@example.com is:unread"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
      </div>

      {results && (
        <div className="card">
          {results.length === 0 ? (
            <div className="empty-state">No results.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>Subject</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => open(r.id)}>
                    <td>{r.from}</td>
                    <td>{r.subject || "(no subject)"}</td>
                    <td className="muted">{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selected && (
        <div className="card">
          <h3>{selected.subject || "(no subject)"}</h3>
          <p className="muted">
            From: {selected.from} · {selected.date}
          </p>
          <pre>{selected.body || selected.snippet}</pre>

          <h3>Draft a reply</h3>
          <form onSubmit={saveDraft}>
            <div className="field">
              <label htmlFor="draftTo">To</label>
              <input id="draftTo" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="draftSubject">Subject</label>
              <input
                id="draftSubject"
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="draftBody">Body</label>
              <textarea id="draftBody" value={draftBody} onChange={(e) => setDraftBody(e.target.value)} />
            </div>
            {draftSaved && <p className="muted">{draftSaved}</p>}
            <button type="submit" disabled={savingDraft}>
              {savingDraft ? "Saving…" : "Save draft"}
            </button>
          </form>
        </div>
      )}

      <p className="muted">
        Nothing configured? Set up Gmail in <Link href="/integrations">Integrations</Link>.
      </p>
    </>
  );
}
