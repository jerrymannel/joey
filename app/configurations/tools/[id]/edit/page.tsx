"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../../../lib/api.ts";
import type { ToolDef } from "../../../../lib/types.ts";

export default function EditToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [tool, setTool] = useState<ToolDef | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ToolDef>(`/api/tools/${id}`)
      .then((t) => {
        setTool(t);
        setName(t.name);
        setDescription(t.description);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/tools/${id}`, { name, description });
      router.push(`/configurations/tools/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save tool");
    } finally {
      setSaving(false);
    }
  }

  if (!tool) {
    return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  }

  return (
    <>
      <p className="crumb">
        <Link href={`/configurations/tools/${id}`}>← {tool.name}</Link>
      </p>
      <div className="page-header">
        <h1>Edit tool</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card form-page">
        <form onSubmit={submit}>
          <div className="field">
            <label>Service</label>
            <p className="muted" style={{ margin: "4px 0", textTransform: "capitalize" }}>
              {tool.service} (fixed after creation)
            </p>
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
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="secondary" onClick={() => router.push(`/configurations/tools/${id}`)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
