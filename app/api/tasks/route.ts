import { NextRequest, NextResponse } from "next/server";
import { createTask, getTaskByFolder, listTasks, TASK_SERVICES, type Harness, type TaskService } from "@/src/engine/task-board.ts";
import { jsonError } from "../_lib/respond.ts";

export async function GET(request: NextRequest) {
  const service = request.nextUrl.searchParams.get("service") as TaskService | null;
  if (service && !TASK_SERVICES.includes(service)) return jsonError(400, `service must be one of ${TASK_SERVICES.join(", ")}`);
  return NextResponse.json(listTasks(service ?? undefined));
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    folderPath?: string;
    service?: TaskService;
    prompt?: string;
    harness?: Harness;
    cliParams?: string;
    model?: string;
    schedule?: string | null;
    toolIds?: string[];
    searchQuery?: string;
    playlistId?: string;
    thinkingLevel?: string;
    trustFolder?: boolean;
  };
  if (!body.name) {
    return jsonError(400, "name is required");
  }
  const isAutomation = body.service === "gmail" || body.service === "youtube";
  if (!isAutomation && !body.folderPath) {
    return jsonError(400, "folderPath is required");
  }
  if (body.folderPath && getTaskByFolder(body.folderPath)) {
    return jsonError(409, "a task for this folder already exists");
  }
  try {
    const task = createTask({ ...body, name: body.name });
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return jsonError(400, (err as Error).message);
  }
}
