import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { NextResponse } from "next/server";
import { isMdName, listSkills, newSkillPath } from "@/src/engine/definitions.ts";
import { jsonError } from "../../_lib/respond.ts";

/** Every skill in skills/ (a folder with SKILL.md, or a loose .md), with its text. Every agent gets them all. */
export async function GET() {
  return NextResponse.json(
    listSkills().map((path) => {
      const isDir = statSync(/* turbopackIgnore: true */ path).isDirectory();
      const file = isDir ? join(path, "SKILL.md") : path;
      const content = existsSync(/* turbopackIgnore: true */ file) ? readFileSync(/* turbopackIgnore: true */ file, "utf8") : "";
      return { name: basename(path), kind: isDir ? "folder" : "file", content };
    }),
  );
}

/** Creates a loose skill, skills/<name>.md (`{ name, content }`); refuses a name that's taken. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && !body.name.endsWith(".md") ? `${body.name}.md` : body.name;
  if (typeof name !== "string" || !isMdName(name) || name === "README.md") return jsonError(400, "name must be letters, digits, . _ - (ending in .md)");
  if (typeof body.content !== "string") return jsonError(400, "content must be a string");
  const path = newSkillPath(name);
  if (existsSync(/* turbopackIgnore: true */ path)) return jsonError(409, `skills/${name} already exists`);
  mkdirSync(/* turbopackIgnore: true */ dirname(path), { recursive: true });
  writeFileSync(/* turbopackIgnore: true */ path, body.content);
  return NextResponse.json({ name, kind: "file", content: body.content }, { status: 201 });
}
