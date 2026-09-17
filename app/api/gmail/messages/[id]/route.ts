import { NextRequest, NextResponse } from "next/server";
import { readEmail } from "@/src/engine/gmail.ts";
import { jsonError } from "../../../_lib/respond.ts";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const account = request.nextUrl.searchParams.get("account") ?? undefined;
  try {
    return NextResponse.json(await readEmail(id, account));
  } catch (err) {
    return jsonError(400, (err as Error).message);
  }
}
