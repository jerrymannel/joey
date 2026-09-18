import { NextResponse } from "next/server";
import { createModel, listModels } from "@/src/engine/models.ts";
import { jsonError } from "../_lib/respond.ts";

export async function GET() {
  return NextResponse.json(listModels());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; value?: string; endpoint?: string };
  if (!body.name || !body.value) return jsonError(400, "name and value are required");
  return NextResponse.json(createModel({ name: body.name, value: body.value, endpoint: body.endpoint }), { status: 201 });
}
