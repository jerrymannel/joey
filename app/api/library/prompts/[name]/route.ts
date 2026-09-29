import { existsSync, writeFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { isPromptName, promptPath } from "@/src/engine/definitions.ts";
import { jsonError } from "../../../_lib/respond.ts";

/** Overwrites prompts/<name> with `{ content }` — the next run that uses it reads the new text. */
export async function PUT(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.content !== "string") return jsonError(400, "content must be a string");
  if (!isPromptName(name) || !existsSync(/* turbopackIgnore: true */ promptPath(name))) return jsonError(404, "prompt not found");
  writeFileSync(/* turbopackIgnore: true */ promptPath(name), body.content);
  return NextResponse.json({ name, content: body.content });
}
