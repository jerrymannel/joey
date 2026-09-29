import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { NextResponse } from "next/server";
import { skillFile } from "@/src/engine/definitions.ts";
import { jsonError } from "../../../_lib/respond.ts";

/** Overwrites skill <name>'s markdown (a folder's SKILL.md, or the loose file) with `{ content }` — applies to the next run. */
export async function PUT(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.content !== "string") return jsonError(400, "content must be a string");
  const file = skillFile(name);
  if (!file) return jsonError(404, "skill not found");
  writeFileSync(/* turbopackIgnore: true */ file, body.content);
  return NextResponse.json({ name, kind: basename(file) === name ? "file" : "folder", content: body.content });
}
