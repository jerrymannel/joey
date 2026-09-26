import { NextResponse } from "next/server";
import { loadModels } from "@/src/engine/definitions.ts";

/** The models an agent can be given (models.yaml) — the New task form's model list. */
export async function GET() {
  return NextResponse.json({ models: loadModels() });
}
