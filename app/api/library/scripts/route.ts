import { NextResponse } from "next/server";
import { loadScripts } from "@/src/engine/definitions.ts";

/** scripts.yaml's entries and any problems with it. */
export async function GET() {
  const { scripts, errors } = loadScripts();
  return NextResponse.json({ scripts: Object.values(scripts), errors });
}
