import { NextResponse } from "next/server";
import { getTask } from "@/src/engine/task-board.ts";
import { describeRun } from "@/src/engine/harness.ts";
import { jsonError } from "../../../_lib/respond.ts";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) return jsonError(404, "task not found");
  return NextResponse.json(describeRun(task));
}
