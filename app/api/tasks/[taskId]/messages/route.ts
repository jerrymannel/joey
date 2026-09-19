import { NextResponse } from "next/server";
import { getTask } from "@/src/engine/task-board.ts";
import { mailAddress, searchMail, sendMail } from "@/src/engine/mailbox.ts";
import { getMailAccount } from "@/src/engine/settings.ts";
import { jsonError } from "../../../_lib/respond.ts";
import { mailView } from "../../../_lib/mail.ts";

type Params = { params: Promise<{ taskId: string }> };

/** This task's email address and the mail sent to it, newest first. Unread = still waiting for the task's next run. */
export async function GET(_request: Request, { params }: Params) {
  const { taskId } = await params;
  const account = getMailAccount();
  if (!account) return NextResponse.json({ address: null, messages: [] });
  const address = mailAddress(account, taskId);
  try {
    return NextResponse.json({ address, messages: (await searchMail(`to:${address}`)).map(mailView) });
  } catch (err) {
    return jsonError(502, (err as Error).message);
  }
}

/** Mails this task's address as the human (no `X-Joey-From`). */
export async function POST(request: Request, { params }: Params) {
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) return jsonError(404, "task not found");
  if (task.service !== "generic") return jsonError(400, "automations don't take messages");
  const { subject, body } = (await request.json()) as { subject?: string; body?: string };
  if (!body?.trim()) return jsonError(400, "message body is required");
  try {
    return NextResponse.json(await sendMail({ jobId: taskId, from: "", subject: subject ?? "", body }), { status: 201 });
  } catch (err) {
    return jsonError(502, (err as Error).message);
  }
}
