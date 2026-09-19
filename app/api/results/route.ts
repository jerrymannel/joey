import { NextRequest, NextResponse } from "next/server";
import { idOf, listResults, resultsDir } from "@/src/engine/mailbox.ts";
import { resultView } from "../_lib/mail.ts";

/** The results folder's files, newest first — optionally just one task's (`?taskId=`). */
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("taskId");
  return NextResponse.json(listResults(resultsDir()).filter((r) => !taskId || idOf(r.from) === taskId).map(resultView));
}
