import { NextResponse } from "next/server";
import { deleteTask, getTask, updateTask } from "@/src/engine/task-board.ts";
import { isGitRepo } from "@/src/engine/worktree.ts";
import { jsonError } from "../../_lib/respond.ts";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) return jsonError(404, "task not found");

  const gitRepo = await isGitRepo(task.folderPath);
  const refreshed = gitRepo === task.isGitRepo ? task : updateTask(taskId, { isGitRepo: gitRepo });
  return NextResponse.json(refreshed);
}

export async function PATCH(request: Request, { params }: Params) {
  const { taskId } = await params;
  const existing = getTask(taskId);
  if (!existing) return jsonError(404, "task not found");

  const body = (await request.json()) as Partial<{
    name: string;
    orchestratorGoal: string;
    secretsFilePath: string | null;
    maxParallelWorkers: number;
  }>;

  // updateTask() clamps maxParallelWorkers to 1 for non-git tasks itself — not repeated here.
  const updated = updateTask(taskId, body);
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { taskId } = await params;
  deleteTask(taskId);
  return new NextResponse(null, { status: 204 });
}
