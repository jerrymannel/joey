import { NextResponse } from "next/server";
import { deleteModel, getModel, updateModel } from "@/src/engine/models.ts";
import { jsonError } from "../../_lib/respond.ts";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const model = getModel(id);
  if (!model) return jsonError(404, "model not found");
  return NextResponse.json(model);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as Partial<{ name: string; value: string; endpoint: string }>;
  const updated = updateModel(id, body);
  if (!updated) return jsonError(404, "model not found");
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  deleteModel(id);
  return new NextResponse(null, { status: 204 });
}
