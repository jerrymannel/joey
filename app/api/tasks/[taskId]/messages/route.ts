import { NextResponse } from "next/server";
import { getTask } from "@/src/engine/task-board.ts";
import { listMessages, mailboxDir, sendMessage, sentAt } from "@/src/engine/mailbox.ts";
import { jsonError } from "../../../_lib/respond.ts";

type Params = { params: Promise<{ taskId: string }> };

/** This task's messages (INBOX + DONE), newest first, with the sender's name resolved. */
export async function GET(_request: Request, { params }: Params) {
  const { taskId } = await params;
  const messages = listMessages(mailboxDir())
    .filter((m) => m.to === taskId)
    .sort((a, b) => b.file.localeCompare(a.file))
    .map((m) => ({ ...m, fromName: getTask(m.from)?.name ?? m.from, sentAt: sentAt(m.file) }));
  return NextResponse.json(messages);
}

/** Drops a `from: human` message in this task's inbox. */
export async function POST(request: Request, { params }: Params) {
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) return jsonError(404, "task not found");
  if (task.service !== "generic") return jsonError(400, "automations don't take messages");
  const { subject, body } = (await request.json()) as { subject?: string; body?: string };
  if (!body?.trim()) return jsonError(400, "message body is required");
  return NextResponse.json(sendMessage(mailboxDir(), { to: taskId, from: "human", subject: subject ?? "", body }), { status: 201 });
}
