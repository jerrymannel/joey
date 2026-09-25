import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { isTaskSlug, taskPath } from "@/src/engine/definitions.ts";
import { hasActiveRun, listTaskRuns } from "@/src/engine/task-runs.ts";
import { startTaskRun } from "@/src/engine/task-run.ts";
import { jsonError } from "../../../_lib/respond.ts";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  return NextResponse.json(listTaskRuns(slug));
}

export async function POST(_request: Request, { params }: Params) {
  const { slug } = await params;
  if (!isTaskSlug(slug) || !existsSync(/* turbopackIgnore: true */ taskPath(slug))) return jsonError(404, "task not found");
  if (hasActiveRun(slug)) return jsonError(409, "this task is already running");
  try {
    return NextResponse.json(startTaskRun(slug), { status: 201 });
  } catch (err) {
    return jsonError(400, err instanceof Error ? err.message : "failed to start run");
  }
}
