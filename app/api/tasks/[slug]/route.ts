import { existsSync, readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { isTaskSlug, loadTask, taskPath } from "@/src/engine/definitions.ts";
import { isPaused, setPaused } from "@/src/engine/task-runs.ts";
import { jsonError } from "../../_lib/respond.ts";

type Params = { params: Promise<{ slug: string }> };

/** The task as parsed (or its errors) plus the file as written. */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const path = taskPath(slug);
  if (!isTaskSlug(slug) || !existsSync(/* turbopackIgnore: true */ path)) return jsonError(404, "task not found");
  const { task, errors } = loadTask(slug);
  return NextResponse.json({ slug, task: task ?? null, errors, paused: isPaused(slug), source: readFileSync(/* turbopackIgnore: true */ path, "utf8") });
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
