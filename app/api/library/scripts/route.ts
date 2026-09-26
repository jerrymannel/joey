import { NextResponse } from "next/server";
import { loadScripts } from "@/src/engine/definitions.ts";

/** The scripts (scripts/<name>/config.yaml) and any problems with them. */
export async function GET() {
  const { scripts, errors } = loadScripts();
  return NextResponse.json({ scripts: Object.values(scripts), errors });
}
