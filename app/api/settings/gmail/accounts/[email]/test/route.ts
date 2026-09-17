import { NextResponse } from "next/server";
import { testGmailAccount } from "@/src/engine/gmail.ts";
import { jsonError } from "../../../../../_lib/respond.ts";

type Params = { params: Promise<{ email: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { email } = await params;
  try {
    return NextResponse.json(await testGmailAccount(decodeURIComponent(email)));
  } catch (err) {
    return jsonError(400, (err as Error).message);
  }
}
