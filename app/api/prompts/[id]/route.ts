import { NextResponse } from "next/server";
import { deletePrompt, getPrompt, updatePrompt } from "@/src/engine/prompts.ts";
import { jsonError } from "../../_lib/respond.ts";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const prompt = getPrompt(id);
  if (!prompt) return jsonError(404, "prompt not found");
  return NextResponse.json(prompt);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as Partial<{ name: string; content: string }>;
  const updated = updatePrompt(id, body);
  if (!updated) return jsonError(404, "prompt not found");
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  deletePrompt(id);
  return new NextResponse(null, { status: 204 });
}
