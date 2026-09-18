"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../../lib/api.ts";
import type { Prompt } from "../../../lib/types.ts";

export default function NewPromptPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const prompt = await api.post<Prompt>("/api/prompts", { name, content });
      router.push(`/configurations/prompts/${prompt.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to create prompt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p className="crumb">
        <Link href="/configurations/prompts">← Prompts</Link>
      </p>
      <div className="page-header">
        <h1>New prompt</h1>
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
              {saving ? "Creating…" : "Create"}
            </button>
            <button type="button" className="secondary" onClick={() => router.push("/configurations/prompts")}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
