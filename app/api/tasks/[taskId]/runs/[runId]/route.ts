import { NextResponse } from "next/server";
import { getRun } from "@/src/engine/run-log.ts";
import { jsonError } from "../../../../_lib/respond.ts";

type Params = { params: Promise<{ taskId: string; runId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!run) return jsonError(404, "run not found");
  return NextResponse.json(run);
}
