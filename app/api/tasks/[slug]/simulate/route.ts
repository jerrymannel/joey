import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { isTaskSlug, taskPath } from "@/src/engine/definitions.ts";
import { simulateTask } from "@/src/engine/simulate.ts";
import { jsonError } from "../../../_lib/respond.ts";

type Params = { params: Promise<{ slug: string }> };

/** The herdr + pi commands a run of this task would issue, without running it — for the Simulate button. */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  if (!isTaskSlug(slug) || !existsSync(/* turbopackIgnore: true */ taskPath(slug))) return jsonError(404, "task not found");
  try {
    return NextResponse.json(simulateTask(slug));
  } catch (err) {
    return jsonError(400, err instanceof Error ? err.message : "couldn't simulate the task");
  }
}
