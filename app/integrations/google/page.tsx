"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../lib/api.ts";
import type { GmailStatus, YoutubeStatus, TokenInfo } from "../../lib/types.ts";

type TestResult = TokenInfo | { error: string };

/** Human-readable names for the Google OAuth scopes this app ever requests (gmail.ts's/youtube.ts's SCOPES). */
const SCOPE_LABELS: Record<string, string> = {
  "https://www.googleapis.com/auth/gmail.readonly": "Gmail — read mail",
  "https://www.googleapis.com/auth/gmail.compose": "Gmail — compose drafts",
  "https://www.googleapis.com/auth/youtube.readonly": "YouTube — read videos & playlists",
  "https://www.googleapis.com/auth/userinfo.email": "Google account — email address",
};

/** Translates a token's granted scopes into the plain-English services/permissions they unlock. */
function describeAccess(scopes: string[]): string {
  if (scopes.length === 0) return "no access — the token carries no scopes";
  return scopes.map((s) => SCOPE_LABELS[s] ?? s).join(", ");
}

/** One connected account's row: email, a Test button that shows granted scopes, and Disconnect. */
function AccountRow({
  email,
  testing,
  disconnecting,
  result,
  onTest,
  onDisconnect,
}: {
  email: string;
  testing: boolean;
  disconnecting: boolean;
  result: TestResult | undefined;
  onTest: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div>
      <div className="row-between">
        <span>{email}</span>
        <div className="row">
          <button type="button" disabled={testing} onClick={onTest}>
            {testing ? "Testing…" : "Test"}
          </button>
          <button type="button" className="secondary" disabled={disconnecting} onClick={onDisconnect}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      </div>
      {result &&
        ("error" in result ? (
          <div className="error-banner">{result.error}</div>
        ) : (
          <p className="muted">Access: {describeAccess(result.scopes)}</p>
        ))}
    </div>
  );
}

export default function GoogleIntegrationPage() {
  return (
    <Suspense>
      <GoogleIntegrationContent />
    </Suspense>
  );
}

function GoogleIntegrationContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(searchParams.get("gmailError"));
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    api.get<GmailStatus>("/api/settings/gmail").then((s) => {
      setStatus(s);
      setClientId(s.clientId ?? "");
    });
  }, []);

  async function test(email: string) {
    setTesting(email);
    try {
      const result = await api.get<TokenInfo>(`/api/settings/gmail/accounts/${encodeURIComponent(email)}/test`);
      setTestResults((r) => ({ ...r, [email]: result }));
    } catch (err) {
      setTestResults((r) => ({ ...r, [email]: { error: err instanceof ApiError ? err.message : "test failed" } }));
    } finally {
      setTesting(null);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api.put<GmailStatus>("/api/settings/gmail", { clientId, clientSecret });
      setStatus(updated);
      setClientSecret("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save the Google OAuth client");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(email: string) {
    setDisconnecting(email);
    setError(null);
    try {
      await api.del(`/api/settings/gmail/accounts/${encodeURIComponent(email)}`);
      setStatus((s) => (s ? { ...s, accounts: s.accounts.filter((a) => a.email !== email) } : s));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to disconnect account");
    } finally {
      setDisconnecting(null);
    }
  }

  const [ytStatus, setYtStatus] = useState<YoutubeStatus | null>(null);
  const [ytError, setYtError] = useState<string | null>(searchParams.get("youtubeError"));
  const [ytDisconnecting, setYtDisconnecting] = useState<string | null>(null);
  const [ytTestResults, setYtTestResults] = useState<Record<string, TestResult>>({});
  const [ytTesting, setYtTesting] = useState<string | null>(null);

  useEffect(() => {
    // YouTube always rides on the Google client above now — no separate client to configure.
    api.get<YoutubeStatus>("/api/settings/youtube").then((s) => {
      if (s.usesGmailApp) {
        setYtStatus(s);
      } else {
        api
          .put<YoutubeStatus>("/api/settings/youtube", { usesGmailApp: true })
          .then(setYtStatus)
          .catch(() => setYtStatus(s));
      }
    });
  }, []);

  async function testYoutube(email: string) {
    setYtTesting(email);
    try {
      const result = await api.get<TokenInfo>(`/api/settings/youtube/accounts/${encodeURIComponent(email)}/test`);
      setYtTestResults((r) => ({ ...r, [email]: result }));
    } catch (err) {
      setYtTestResults((r) => ({ ...r, [email]: { error: err instanceof ApiError ? err.message : "test failed" } }));
    } finally {
      setYtTesting(null);
    }
  }

  async function disconnectYoutube(email: string) {
    setYtDisconnecting(email);
    setYtError(null);
    try {
      await api.del(`/api/settings/youtube/accounts/${encodeURIComponent(email)}`);
      setYtStatus((s) => (s ? { ...s, accounts: s.accounts.filter((a) => a.email !== email) } : s));
    } catch (err) {
      setYtError(err instanceof ApiError ? err.message : "failed to disconnect account");
    } finally {
      setYtDisconnecting(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Google</h1>
      </div>

      <div className="card">
        <p className="muted">
          Create a Google Cloud OAuth client (with a redirect URI of{" "}
          <code>{"<this app's URL>"}/api/settings/google/callback</code>) and paste its Client ID and Secret
          below. The same client can be shared by every service below — scopes are requested per connection, not
          baked into the client. Values are encrypted before being stored.
        </p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={save}>
          <div className="field">
            <label htmlFor="clientId">Client ID</label>
            <input id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="clientSecret">Client Secret</label>
            <input
              id="clientSecret"
              type="password"
              placeholder={status?.configured ? "unchanged" : ""}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              required={!status?.configured}
            />
          </div>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>

      <h2>Services</h2>

      <div className="card">
        <h3>Gmail</h3>
        <p className="muted">Search, read, and draft mail — this app never sends mail.</p>

        {!status?.configured ? (
          <p className="muted">Save a Client ID and Secret above first.</p>
        ) : status.accounts.length === 0 ? (
          <a href="/api/settings/google/connect?service=gmail">
            <button type="button">Connect</button>
          </a>
        ) : (
          status.accounts.map((a) => (
            <AccountRow
              key={a.email}
              email={a.email}
              testing={testing === a.email}
              disconnecting={disconnecting === a.email}
              result={testResults[a.email]}
              onTest={() => test(a.email)}
              onDisconnect={() => disconnect(a.email)}
            />
          ))
        )}
      </div>

      <div className="card">
        <h3>YouTube</h3>
        <p className="muted">
          Reads playlists from a connected account. Pick a playlist per automation under{" "}
          <Link href="/automations/youtube">Automations → YouTube</Link>.
        </p>

        {ytError && <div className="error-banner">{ytError}</div>}

        {!ytStatus?.configured ? (
          <p className="muted">Save a Client ID and Secret above first.</p>
        ) : ytStatus.accounts.length === 0 ? (
          <a href="/api/settings/google/connect?service=youtube">
            <button type="button">Connect</button>
          </a>
        ) : (
          ytStatus.accounts.map((a) => (
            <AccountRow
              key={a.email}
              email={a.email}
              testing={ytTesting === a.email}
              disconnecting={ytDisconnecting === a.email}
              result={ytTestResults[a.email]}
              onTest={() => testYoutube(a.email)}
              onDisconnect={() => disconnectYoutube(a.email)}
            />
          ))
        )}
      </div>
    </>
  );
}
