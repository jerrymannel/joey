import { NextRequest, NextResponse } from "next/server";
import { createDraft } from "@/src/engine/gmail.ts";
import { jsonError } from "../../_lib/respond.ts";

// No send endpoint exists in this connector — drafts only, by design.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<{ to: string; subject: string; body: string; account: string }>;
  if (!body.to || !body.subject) return jsonError(400, "to and subject are required");
  try {
    return NextResponse.json(await createDraft(body.to, body.subject, body.body ?? "", body.account), {
      status: 201,
    });
  } catch (err) {
    return jsonError(400, (err as Error).message);
  }
}
