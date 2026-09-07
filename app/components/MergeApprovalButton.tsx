"use client";

import { useState } from "react";
import { api, ApiError } from "../lib/api.ts";
import type { Worker } from "../lib/types.ts";

export function MergeApprovalButton({ worker }: { worker: Worker }) {
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (worker.status === "merged") {
    return <p className="muted">Merged.</p>;
  }
  if (worker.status === "awaiting_merge") {
    return <p className="muted">Waiting for orchestrator to merge…</p>;
  }

  async function approve() {
    setApproving(true);
    setError(null);
    try {
      await api.post(`/api/workers/${worker.id}/approve-merge`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to approve merge");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div>
      <button onClick={approve} disabled={approving}>
        {approving ? "Approving…" : "Merge"}
      </button>
      {error && <p className="error-banner">{error}</p>}
    </div>
  );
}
