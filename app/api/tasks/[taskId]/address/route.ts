import { NextResponse } from "next/server";
import { mailAddress } from "@/src/engine/mailbox.ts";
import { getMailAccount } from "@/src/engine/settings.ts";

/** This task's email address (null while no agent mailbox account is set). */
export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const account = getMailAccount();
  return NextResponse.json({ address: account ? mailAddress(account, taskId) : null });
}
