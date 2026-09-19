import { NextRequest, NextResponse } from "next/server";
import { getTask } from "@/src/engine/task-board.ts";
import { listResults, mailboxDir, sentAt } from "@/src/engine/mailbox.ts";

/** The RESULTS mailbox, newest first — optionally just one task's (`?taskId=`), each with the sender's name resolved. */
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("taskId");
  const results = listResults(mailboxDir())
    .filter((m) => !taskId || m.from === taskId)
    .map((m) => ({ ...m, fromName: getTask(m.from)?.name ?? m.from, sentAt: sentAt(m.file) }));
  return NextResponse.json(results);
}
