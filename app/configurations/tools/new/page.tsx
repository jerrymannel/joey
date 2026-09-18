"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../../lib/api.ts";
import { TOOL_SERVICES, type ToolDef, type ToolService } from "../../../lib/types.ts";

export default function NewToolPage() {
  const router = useRouter();
  const [service, setService] = useState<ToolService>(TOOL_SERVICES[0]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const tool = await api.post<ToolDef>("/api/tools", { service, name, description });
      router.push(`/configurations/tools/${tool.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to create tool");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p className="crumb">
        <Link href="/configurations/tools">← Tools</Link>
      </p>
      <div className="page-header">
        <h1>New tool</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card form-page">
        <form onSubmit={submit}>
          <div className="field">
            <label>Service</label>
            <select value={service} onChange={(e) => setService(e.target.value as ToolService)}>
              {TOOL_SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="row">
            <button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create"}
            </button>
            <button type="button" className="secondary" onClick={() => router.push("/configurations/tools")}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
