import { NextResponse } from "next/server";
import { approveMerge, getWorker, updateWorkerStatus } from "@/src/engine/run-log.ts";
import { jsonError } from "../../../_lib/respond.ts";

type Params = { params: Promise<{ workerId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { workerId } = await params;
  const worker = getWorker(workerId);
  if (!worker) return jsonError(404, "worker not found");
  if (worker.status !== "reviewed") {
    return jsonError(409, `worker must be "reviewed" to approve a merge, got "${worker.status}"`);
  }

  approveMerge(workerId);
  updateWorkerStatus(workerId, "awaiting_merge");
  return NextResponse.json(getWorker(workerId));
}
