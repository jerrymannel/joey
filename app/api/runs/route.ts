import { NextResponse } from "next/server";
import { listTaskRuns } from "@/src/engine/task-runs.ts";

/** The latest runs of every task, newest first — without their logs, which /api/runs/:id has. */
export async function GET() {
  return NextResponse.json(listTaskRuns().map(({ log: _log, ...run }) => run));
}
