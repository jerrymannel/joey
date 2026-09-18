import { NextResponse } from "next/server";
import { createPrompt, listPrompts } from "@/src/engine/prompts.ts";
import { jsonError } from "../_lib/respond.ts";

export async function GET() {
  return NextResponse.json(listPrompts());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; content?: string };
  if (!body.name) return jsonError(400, "name is required");
  return NextResponse.json(createPrompt({ name: body.name, content: body.content ?? "" }), { status: 201 });
}
