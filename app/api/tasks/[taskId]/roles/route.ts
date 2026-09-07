import { NextResponse } from "next/server";
import { createRole, getTask, listRoles } from "@/src/engine/task-board.ts";
import type { ArtifactSchema } from "@/src/engine/artifact.ts";
import { jsonError } from "../../../_lib/respond.ts";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { taskId } = await params;
  return NextResponse.json(listRoles(taskId));
}

export async function POST(request: Request, { params }: Params) {
  const { taskId } = await params;
  if (!getTask(taskId)) return jsonError(404, "task not found");

  const body = (await request.json()) as {
    name?: string;
    isReviewer?: boolean;
    systemPrompt?: string;
    provider?: string;
    model?: string;
    toolsAllowlist?: string[] | null;
    toolsDenylist?: string[] | null;
    artifactPath?: string;
    artifactSchema?: ArtifactSchema | null;
  };
  if (!body.name || !body.systemPrompt || !body.provider || !body.model || !body.artifactPath) {
    return jsonError(400, "name, systemPrompt, provider, model, and artifactPath are required");
  }

  const role = createRole({
    taskId,
    name: body.name,
    isReviewer: body.isReviewer ?? false,
    systemPrompt: body.systemPrompt,
    provider: body.provider,
    model: body.model,
    toolsAllowlist: body.toolsAllowlist ?? null,
    toolsDenylist: body.toolsDenylist ?? null,
    artifactPath: body.artifactPath,
    artifactSchema: body.artifactSchema ?? null,
  });
  return NextResponse.json(role, { status: 201 });
}
