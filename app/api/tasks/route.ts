import { NextResponse } from "next/server";
import { createTask, getTaskByFolder, listTasks } from "@/src/engine/task-board.ts";
import { isGitRepo } from "@/src/engine/worktree.ts";
import { jsonError } from "../_lib/respond.ts";

export async function GET() {
  return NextResponse.json(listTasks());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; folderPath?: string };
  if (!body.name || !body.folderPath) {
    return jsonError(400, "name and folderPath are required");
  }
  if (getTaskByFolder(body.folderPath)) {
    return jsonError(409, "a task for this folder already exists");
  }
  const gitRepo = await isGitRepo(body.folderPath);
  const task = createTask({ name: body.name, folderPath: body.folderPath, isGitRepo: gitRepo });
  return NextResponse.json(task, { status: 201 });
}
