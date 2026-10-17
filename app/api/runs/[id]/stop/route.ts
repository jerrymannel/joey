import { NextResponse } from "next/server";
import { getTaskRun } from "@/src/engine/task-runs.ts";
import { stopTaskRun } from "@/src/engine/task-run.ts";
import { jsonError } from "../../../_lib/respond.ts";

type Params = { params: Promise<{ id: string }> };

/** Stops a running run: its current step is abandoned, the rest skipped, the run marked `stopped` a moment later. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const run = getTaskRun(id);
  if (!run) return jsonError(404, "run not found");
  if (run.status !== "running") return jsonError(409, "this run isn't running");
  if (!stopTaskRun(id)) return jsonError(409, "this run isn't running in this server (started with npm run start-run?) — stop that process instead");
  return NextResponse.json({ stopping: true });
}
