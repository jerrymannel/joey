import { NextResponse } from "next/server";
import { listTaskFiles } from "@/src/engine/definitions.ts";
import { isPaused, listTaskRuns } from "@/src/engine/task-runs.ts";

/** Every tasks/*.yaml, valid or not, with its last run. */
export async function GET() {
  return NextResponse.json(
    listTaskFiles().map(({ slug, task }) => {
      const last = listTaskRuns(slug, 1)[0];
      return {
        slug,
        name: task?.name ?? slug,
        schedule: task?.schedule ?? null,
        valid: !!task,
        paused: isPaused(slug),
        lastRun: last ? { id: last.id, status: last.status, startedAt: last.startedAt } : null,
      };
    }),
  );
}
