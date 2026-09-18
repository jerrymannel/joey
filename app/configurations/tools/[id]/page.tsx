"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api.ts";
import type { ToolDef } from "../../../lib/types.ts";
import ConfirmModal from "../../../components/ConfirmModal.tsx";

export default function ToolViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [tool, setTool] = useState<ToolDef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    api.get<ToolDef>(`/api/tools/${id}`).then(setTool).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  async function confirmDelete() {
    await api.del(`/api/tools/${id}`);
    router.push("/configurations/tools");
  }

  if (!tool) {
    return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  }

  return (
    <>
      <p className="crumb">
        <Link href="/configurations/tools">← Tools</Link>
      </p>
      <div className="page-header">
        <h1>{tool.name}</h1>
        <span className="row">
          <button type="button" className="secondary" onClick={() => router.push(`/configurations/tools/${id}/edit`)}>
            Edit
          </button>
          <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        </span>
      </div>

      <div className="card">
        <div className="field">
          <label>Service</label>
          <p style={{ margin: 0, textTransform: "capitalize" }}>{tool.service}</p>
        </div>
        <div className="field">
          <label>Description</label>
          <p style={{ margin: 0 }}>{tool.description || "(none)"}</p>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete tool?"
          message={`"${tool.name}" will no longer be selectable on ${tool.service} automations.`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}
