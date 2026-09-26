import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { NextResponse } from "next/server";
import { listSkills } from "@/src/engine/definitions.ts";

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
