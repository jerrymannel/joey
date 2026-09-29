import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { NextResponse } from "next/server";
import { isPromptName, listPrompts, promptPath } from "@/src/engine/definitions.ts";
import { jsonError } from "../../_lib/respond.ts";

/** Every prompts/*.md with its text. */
export async function GET() {
  return NextResponse.json(listPrompts().map((name) => ({ name, content: readFileSync(/* turbopackIgnore: true */ promptPath(name), "utf8") })));
}

/** Creates prompts/<name> (`{ name, content }`); refuses a name that's taken. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && !body.name.endsWith(".md") ? `${body.name}.md` : body.name;
  if (typeof name !== "string" || !isPromptName(name)) return jsonError(400, "name must be letters, digits, . _ - (ending in .md)");
  if (typeof body.content !== "string") return jsonError(400, "content must be a string");
  const path = promptPath(name);
  if (existsSync(/* turbopackIgnore: true */ path)) return jsonError(409, `prompts/${name} already exists`);
  mkdirSync(/* turbopackIgnore: true */ dirname(path), { recursive: true });
  writeFileSync(/* turbopackIgnore: true */ path, body.content);
  return NextResponse.json({ name, content: body.content }, { status: 201 });
}
