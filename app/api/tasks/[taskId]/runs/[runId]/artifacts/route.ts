import { readdirSync } from "node:fs";
import { NextResponse } from "next/server";
import { getTask } from "@/src/engine/task-board.ts";
import { jsonError } from "../../../../../_lib/respond.ts";

type Params = { params: Promise<{ taskId: string; runId: string }> };

/** Runs don't get their own artifact directory — this just lists what's currently in the automation's workspace folder. */
export async function GET(_request: Request, { params }: Params) {
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) return jsonError(404, "task not found");

  try {
    const entries = readdirSync(task.folderPath, { withFileTypes: true });
    return NextResponse.json(entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).sort());
  } catch {
    return NextResponse.json([]);
  }
}
