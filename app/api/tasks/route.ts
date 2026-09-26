import { existsSync, rmSync, writeFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { stringify } from "yaml";
import { isTaskSlug, listTaskFiles, loadTask, taskPath } from "@/src/engine/definitions.ts";
import { isPaused, listTaskRuns } from "@/src/engine/task-runs.ts";
import { jsonError } from "../_lib/respond.ts";

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

/** Writes a new tasks/<slug>.yaml from the form's structured definition, validating it before keeping it. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const definition = body.definition;
  if (!isTaskSlug(slug)) return jsonError(400, "the file name must be lowercase letters, digits and dashes");
  if (typeof definition !== "object" || definition === null) return jsonError(400, "missing task definition");
  const path = taskPath(slug);
  if (existsSync(/* turbopackIgnore: true */ path)) return jsonError(409, `tasks/${slug}.yaml already exists`);

  writeFileSync(/* turbopackIgnore: true */ path, stringify(definition));
  const { errors } = loadTask(slug);
  if (errors.length > 0) {
    rmSync(/* turbopackIgnore: true */ path, { force: true });
    return NextResponse.json({ error: errors.join("\n"), errors }, { status: 422 });
  }
  return NextResponse.json({ slug }, { status: 201 });
}
