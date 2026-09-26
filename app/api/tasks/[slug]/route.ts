import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { isTaskSlug, loadTask, taskPath } from "@/src/engine/definitions.ts";
import { deleteTaskState, hasActiveRun, isPaused, setPaused } from "@/src/engine/task-runs.ts";
import { jsonError } from "../../_lib/respond.ts";

type Params = { params: Promise<{ slug: string }> };

/** The task as parsed (or its errors) plus the file as written. */
function detail(slug: string) {
  const { task, errors } = loadTask(slug);
  return { slug, task: task ?? null, errors, paused: isPaused(slug), source: readFileSync(/* turbopackIgnore: true */ taskPath(slug), "utf8") };
}

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  if (!isTaskSlug(slug) || !existsSync(/* turbopackIgnore: true */ taskPath(slug))) return jsonError(404, "task not found");
  return NextResponse.json(detail(slug));
}

/** Overwrites the task's yaml file with `source` (validated on the next read — errors come back in `errors`, they don't block the save). */
export async function PUT(request: Request, { params }: Params) {
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.source !== "string") return jsonError(400, "source must be the task's yaml");
  if (!isTaskSlug(slug) || !existsSync(/* turbopackIgnore: true */ taskPath(slug))) return jsonError(404, "task not found");
  writeFileSync(/* turbopackIgnore: true */ taskPath(slug), body.source);
  return NextResponse.json(detail(slug));
}

/** `{ paused }` — the only thing about a task that's edited here; everything else is its yaml file. */
export async function PATCH(request: Request, { params }: Params) {
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.paused !== "boolean") return jsonError(400, "paused must be true or false");
  if (!isTaskSlug(slug) || !existsSync(/* turbopackIgnore: true */ taskPath(slug))) return jsonError(404, "task not found");
  setPaused(slug, body.paused);
  return NextResponse.json({ paused: body.paused });
}

/** Deletes the task's yaml file and its paused state. Its run history is kept (still under /runs). Refuses while a run is active. */
export async function DELETE(_request: Request, { params }: Params) {
  const { slug } = await params;
  if (!isTaskSlug(slug) || !existsSync(/* turbopackIgnore: true */ taskPath(slug))) return jsonError(404, "task not found");
  if (hasActiveRun(slug)) return jsonError(409, "can't delete a task while it's running");
  rmSync(/* turbopackIgnore: true */ taskPath(slug), { force: true });
  deleteTaskState(slug);
  return new NextResponse(null, { status: 204 });
}
