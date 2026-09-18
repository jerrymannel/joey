"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../../../lib/api.ts";
import type { Prompt } from "../../../../lib/types.ts";

export default function EditPromptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Prompt>(`/api/prompts/${id}`)
      .then((p) => {
        setPrompt(p);
        setName(p.name);
        setContent(p.content);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/prompts/${id}`, { name, content });
      router.push(`/configurations/prompts/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save prompt");
    } finally {
      setSaving(false);
    }
  }

  if (!prompt) {
    return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  }

  return (
    <>
      <p className="crumb">
        <Link href={`/configurations/prompts/${id}`}>← {prompt.name}</Link>
      </p>
      <div className="page-header">
        <h1>Edit prompt</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card form-page">
        <form onSubmit={submit}>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Content</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div className="row">
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="secondary" onClick={() => router.push(`/configurations/prompts/${id}`)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
