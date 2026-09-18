"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api.ts";
import type { Prompt } from "../../../lib/types.ts";
import ConfirmModal from "../../../components/ConfirmModal.tsx";

export default function PromptViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    api.get<Prompt>(`/api/prompts/${id}`).then(setPrompt).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  async function confirmDelete() {
    await api.del(`/api/prompts/${id}`);
    router.push("/configurations/prompts");
  }

  if (!prompt) {
    return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  }

  return (
    <>
      <p className="crumb">
        <Link href="/configurations/prompts">← Prompts</Link>
      </p>
      <div className="page-header">
        <h1>{prompt.name}</h1>
        <span className="row">
          <button type="button" className="secondary" onClick={() => router.push(`/configurations/prompts/${id}/edit`)}>
            Edit
          </button>
          <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        </span>
      </div>

      <div className="card">
        <div className="field">
          <label>Content</label>
          <pre className="artifact">{prompt.content || "(empty)"}</pre>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete prompt?"
          message={`"${prompt.name}" will be permanently deleted.`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}
