import { NextResponse } from "next/server";
import { getTask } from "@/src/engine/task-board.ts";
import { listRuns } from "@/src/engine/run-log.ts";
import { startRun } from "@/src/index.ts";
import { jsonError } from "../../../_lib/respond.ts";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { taskId } = await params;
  return NextResponse.json(listRuns(taskId));
}

export async function POST(_request: Request, { params }: Params) {
  const { taskId } = await params;
  if (!getTask(taskId)) return jsonError(404, "task not found");

  const alreadyRunning = listRuns(taskId).some((r) => r.status === "pending" || r.status === "running");
  if (alreadyRunning) return jsonError(409, "a run for this task is already active");

  try {
    const { runId } = await startRun(taskId);
    return NextResponse.json({ runId }, { status: 201 });
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "failed to start run");
  }
}
