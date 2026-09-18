"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../../lib/api.ts";
import type { AiModel } from "../../../../lib/types.ts";
import ModelForm from "../../../../components/ModelForm.tsx";

export default function EditModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [model, setModel] = useState<AiModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AiModel>(`/api/models/${id}`)
      .then(setModel)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  if (!model) {
    return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  }

  return (
    <>
      <p className="crumb">
        <Link href={`/configurations/models/${id}`}>← {model.name}</Link>
      </p>
      <div className="page-header">
        <h1>Edit model</h1>
      </div>

      <ModelForm
        initial={model}
        onCancel={() => router.push(`/configurations/models/${id}`)}
        onSaved={() => router.push(`/configurations/models/${id}`)}
      />
    </>
  );
}
