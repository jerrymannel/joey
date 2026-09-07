import { NextResponse } from "next/server";
import { getRun, latestStatusEvent, listWorkers } from "@/src/engine/run-log.ts";
import { jsonError } from "../../../../_lib/respond.ts";

type Params = { params: Promise<{ taskId: string; runId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!run) return jsonError(404, "run not found");

  const workers = listWorkers(runId).map((worker) => ({
    ...worker,
    latestEvent: latestStatusEvent(worker.id) ?? null,
  }));

  return NextResponse.json({ ...run, workers });
}
