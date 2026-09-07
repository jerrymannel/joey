import { NextResponse } from "next/server";
import { getTask, getRole } from "@/src/engine/task-board.ts";
import { findReviewerFor, getRun, getWorker, listStatusEvents } from "@/src/engine/run-log.ts";
import { readArtifact } from "@/src/engine/artifact.ts";
import { jsonError } from "../../_lib/respond.ts";

type Params = { params: Promise<{ workerId: string }> };

const ARTIFACT_VISIBLE_STATUSES = new Set(["awaiting_review", "reviewed", "awaiting_merge", "merged"]);

async function workerDetail(workerId: string) {
  const worker = getWorker(workerId);
  if (!worker) return undefined;

  const role = getRole(worker.roleId);
  const run = getRun(worker.runId);
  const task = run ? getTask(run.taskId) : undefined;
  const cwd = worker.worktreePath ?? task?.folderPath;

  let artifact = null;
  if (role && cwd && ARTIFACT_VISIBLE_STATUSES.has(worker.status)) {
    artifact = (await readArtifact(cwd, role.artifactPath, role.artifactSchema)) ?? null;
  }

  const reviewer = findReviewerFor(workerId);
  let reviewerVerdict = null;
  if (reviewer) {
    const reviewerRole = getRole(reviewer.roleId);
    const reviewerCwd = reviewer.worktreePath ?? task?.folderPath;
    if (reviewerRole && reviewerCwd && ARTIFACT_VISIBLE_STATUSES.has(reviewer.status)) {
      reviewerVerdict = await readArtifact(reviewerCwd, reviewerRole.artifactPath, reviewerRole.artifactSchema);
    }
  }

  return {
    ...worker,
    artifact,
    reviewer: reviewer ? { ...reviewer, verdict: reviewerVerdict } : null,
    statusEvents: listStatusEvents(workerId),
  };
}

export async function GET(_request: Request, { params }: Params) {
  const { workerId } = await params;
  const detail = await workerDetail(workerId);
  if (!detail) return jsonError(404, "worker not found");
  return NextResponse.json(detail);
}
