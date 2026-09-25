import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { listPrompts, promptPath } from "@/src/engine/definitions.ts";

/** Every prompts/*.md with its text. */
export async function GET() {
  return NextResponse.json(listPrompts().map((name) => ({ name, content: readFileSync(/* turbopackIgnore: true */ promptPath(name), "utf8") })));
}
