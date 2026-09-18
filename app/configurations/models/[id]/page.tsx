"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api.ts";
import type { AiModel } from "../../../lib/types.ts";
import ConfirmModal from "../../../components/ConfirmModal.tsx";

export default function ModelViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [model, setModel] = useState<AiModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    api.get<AiModel>(`/api/models/${id}`).then(setModel).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  async function confirmDelete() {
    await api.del(`/api/models/${id}`);
    router.push("/configurations/models");
  }

  if (!model) {
    return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  }

  return (
    <>
      <p className="crumb">
        <Link href="/configurations/models">← Models</Link>
      </p>
      <div className="page-header">
        <h1>{model.name}</h1>
        <span className="row">
          <button type="button" className="secondary" onClick={() => router.push(`/configurations/models/${id}/edit`)}>
            Edit
          </button>
          <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        </span>
      </div>

      <div className="card">
        <div className="field">
          <label>Value</label>
          <p style={{ margin: 0 }}>{model.value}</p>
        </div>
        {model.endpoint && (
          <div className="field">
            <label>Endpoint</label>
            <p style={{ margin: 0 }}>{model.endpoint}</p>
          </div>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete model?"
          message={`"${model.name}" will no longer be selectable on automations.`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}
