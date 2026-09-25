import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getTaskRun, listRunSteps } from "@/src/engine/task-runs.ts";
import { jsonError } from "../../_lib/respond.ts";

type Params = { params: Promise<{ id: string }> };

/** A step's output can be anything an agent or script wrote; cap what the page gets. */
const MAX_CHARS = 200_000;

function readCapped(path: string): string | null {
  if (!path || !existsSync(/* turbopackIgnore: true */ path)) return null;
  const text = readFileSync(/* turbopackIgnore: true */ path, "utf8");
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n\n… truncated — the full file is ${path}` : text;
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const run = getTaskRun(id);
  if (!run) return jsonError(404, "run not found");
  const steps = listRunSteps(id).map((s) => ({ ...s, output: s.status === "completed" ? readCapped(s.outputFile) : null }));
  return NextResponse.json({ run, steps, result: readCapped(join(run.runDir, "result.md")) });
}
