"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import type { StatusEvent, Worker, WorkerDetail } from "../lib/types.ts";
import { BlockedBanner } from "./BlockedBanner.tsx";
import { MergeApprovalButton } from "./MergeApprovalButton.tsx";

const DETAIL_VISIBLE_STATUSES = new Set(["awaiting_review", "reviewed", "awaiting_merge", "merged", "failed"]);

function elapsed(startedAt: string, endedAt: string | null): string {
  const ms = (endedAt ? new Date(endedAt).getTime() : Date.now()) - new Date(startedAt).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function Artifact({ artifact }: { artifact: WorkerDetail["artifact"] }) {
  if (!artifact) return <p className="muted">No artifact yet.</p>;
  return (
    <>
      {artifact.validation && !artifact.validation.ok && (
        <p className="error-banner">Schema validation failed: {artifact.validation.errors.join("; ")}</p>
      )}
      <pre className="artifact">{artifact.content}</pre>
    </>
  );
}

export function WorkerStatusCard({
  worker,
  isGitRepo,
}: {
  worker: Worker & { latestEvent: StatusEvent | null };
  isGitRepo: boolean;
}) {
  const [detail, setDetail] = useState<WorkerDetail | null>(null);

  useEffect(() => {
    if (!DETAIL_VISIBLE_STATUSES.has(worker.status)) return;
    api
      .get<WorkerDetail>(`/api/workers/${worker.id}`)
      .then(setDetail)
      .catch(() => {});
  }, [worker.id, worker.status]);

  return (
    <div className="card">
      <div className="row-between">
        <h3>{worker.roleName}</h3>
        <div className="row">
          <span className="muted">{elapsed(worker.startedAt, worker.endedAt)}</span>
          <span className={`badge badge-${worker.status}`}>{worker.status}</span>
        </div>
      </div>

      {worker.status === "blocked" && <BlockedBanner workerId={worker.id} />}

      {worker.status === "failed" && (
        <p className="error-banner">
          {worker.artifactMessage ?? "no .orchestrator/done.json / artifact found"}
        </p>
      )}

      {DETAIL_VISIBLE_STATUSES.has(worker.status) && (
        <>
          <Artifact artifact={detail?.artifact ?? null} />

          {detail?.reviewer && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--panel-border)" }}>
              <div className="row-between">
                <strong>Reviewer: {detail.reviewer.roleName}</strong>
                <span className={`badge badge-${detail.reviewer.status}`}>{detail.reviewer.status}</span>
              </div>
              <Artifact artifact={detail.reviewer.verdict} />
            </div>
          )}

          {isGitRepo && worker.status === "reviewed" && (
            <div style={{ marginTop: 12 }}>
              <MergeApprovalButton worker={worker} />
            </div>
          )}
          {isGitRepo && worker.status === "awaiting_merge" && <MergeApprovalButton worker={worker} />}
        </>
      )}
    </div>
  );
}
