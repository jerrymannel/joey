import { NextResponse } from "next/server";
import { deleteRole, updateRole } from "@/src/engine/task-board.ts";
import type { ArtifactSchema } from "@/src/engine/artifact.ts";
import { jsonError } from "../../../../_lib/respond.ts";

type Params = { params: Promise<{ taskId: string; roleId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { roleId } = await params;
  const body = (await request.json()) as Partial<{
    name: string;
    isReviewer: boolean;
    systemPrompt: string;
    provider: string;
    model: string;
    toolsAllowlist: string[] | null;
    toolsDenylist: string[] | null;
    artifactPath: string;
    artifactSchema: ArtifactSchema | null;
  }>;
  const updated = updateRole(roleId, body);
  if (!updated) return jsonError(404, "role not found");
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { roleId } = await params;
  deleteRole(roleId);
  return new NextResponse(null, { status: 204 });
}
