import { NextResponse } from "next/server";
import { deleteTask, getTask, updateTask, type Harness } from "@/src/engine/task-board.ts";
import { jsonError } from "../../_lib/respond.ts";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) return jsonError(404, "task not found");
  return NextResponse.json(task);
}

export async function PATCH(request: Request, { params }: Params) {
  const { taskId } = await params;
  if (!getTask(taskId)) return jsonError(404, "task not found");

  const body = (await request.json()) as Partial<{
    name: string;
    folderPath: string;
    prompt: string;
    harness: Harness;
    cliParams: string;
    model: string;
    schedule: string | null;
    toolIds: string[];
    searchQuery: string;
    playlistId: string;
    thinkingLevel: string;
    trustFolder: boolean;
  }>;

  try {
    return NextResponse.json(updateTask(taskId, body));
  } catch (err) {
    return jsonError(400, (err as Error).message);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { taskId } = await params;
  deleteTask(taskId);
  return new NextResponse(null, { status: 204 });
}
