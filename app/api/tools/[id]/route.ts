import { NextResponse } from "next/server";
import { deleteTool, getTool, updateTool } from "@/src/engine/tools.ts";
import { jsonError } from "../../_lib/respond.ts";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const tool = getTool(id);
  if (!tool) return jsonError(404, "tool not found");
  return NextResponse.json(tool);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as Partial<{ name: string; description: string }>;
  const updated = updateTool(id, body);
  if (!updated) return jsonError(404, "tool not found");
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  deleteTool(id);
  return new NextResponse(null, { status: 204 });
}
