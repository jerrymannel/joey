"use client";

import { useState } from "react";
import { api, ApiError } from "../lib/api.ts";
import type { SshAuthMethod, SshConfig } from "../lib/types.ts";

/** The Create and Edit forms for an SSH configuration (rendered inside the SSH page's SidePanel) both use this. The stored password / key is never sent back, so on Edit a blank secret means "keep it". */
export default function SshForm({ initial, onCancel, onSaved }: { initial?: SshConfig; onCancel: () => void; onSaved: (config: SshConfig) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [host, setHost] = useState(initial?.host ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [authMethod, setAuthMethod] = useState<SshAuthMethod>(initial?.authMethod ?? "password");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keeping the stored secret only makes sense while the auth method stays the same.
  const keepable = !!initial && initial.authMethod === authMethod;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { name, host, username, authMethod, secret };
      onSaved(initial ? await api.patch<SshConfig>(`/api/ssh/${initial.id}`, payload) : await api.post<SshConfig>("/api/ssh", payload));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save SSH configuration");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="web-server" required />
        </div>
        <div className="field">
          <label>IP</label>
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="203.0.113.10" required />
        </div>
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="deploy" required />
        </div>
        <div className="field">
          <label>Auth method</label>
          <label className="row" style={{ fontWeight: "normal" }}>
            <input type="radio" style={{ width: "auto" }} checked={authMethod === "password"} onChange={() => setAuthMethod("password")} />
            Password
          </label>
          <label className="row" style={{ fontWeight: "normal" }}>
            <input type="radio" style={{ width: "auto" }} checked={authMethod === "identity"} onChange={() => setAuthMethod("identity")} />
            Identity (private key)
          </label>
        </div>
        {authMethod === "password" ? (
          <div className="field">
            <label>Password</label>
            <input type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={keepable ? "Leave blank to keep the saved password" : ""} required={!keepable} />
          </div>
        ) : (
          <div className="field">
            <label>Key file content</label>
            <textarea
              rows={8}
              spellCheck={false}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={keepable ? "Leave blank to keep the saved key" : "-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----"}
              style={{ fontFamily: "monospace", fontSize: 12 }}
              required={!keepable}
            />
            <p className="muted" style={{ margin: 0 }}>Paste the private key file's whole content. Keys protected by a passphrase aren't supported.</p>
          </div>
        )}
        <p className="muted">The {authMethod === "password" ? "password" : "key"} is stored encrypted and is never shown again.</p>
        <div className="row">
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : initial ? "Save" : "Create"}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
