import { NextResponse } from "next/server";
import { testYoutubeAccount } from "@/src/engine/youtube.ts";
import { jsonError } from "../../../../../_lib/respond.ts";

type Params = { params: Promise<{ email: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { email } = await params;
  try {
    return NextResponse.json(await testYoutubeAccount(decodeURIComponent(email)));
  } catch (err) {
    return jsonError(400, (err as Error).message);
  }
}
