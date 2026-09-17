import { NextRequest, NextResponse } from "next/server";
import { searchEmails } from "@/src/engine/gmail.ts";
import { jsonError } from "../../_lib/respond.ts";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const account = request.nextUrl.searchParams.get("account") ?? undefined;
  try {
    return NextResponse.json(await searchEmails(q, account));
  } catch (err) {
    return jsonError(400, (err as Error).message);
  }
}
