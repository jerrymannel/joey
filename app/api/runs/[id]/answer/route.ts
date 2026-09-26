import { NextResponse } from "next/server";
import { answerUser } from "@/src/engine/pending-input.ts";
import { jsonError } from "../../../_lib/respond.ts";

type Params = { params: Promise<{ id: string }> };

/** Delivers the user's answer to a run parked on agent_user_input, resuming it. 409 if the run isn't waiting on a question. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const choice = typeof body.choice === "string" ? body.choice.trim() : "";
  if (!choice) return jsonError(400, "choice is required");
  const note = typeof body.note === "string" ? body.note : undefined;
  if (!answerUser(id, { choice, note })) return jsonError(409, "this run isn't waiting for an answer");
  return NextResponse.json({ ok: true });
}
