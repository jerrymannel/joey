import { join } from "node:path";
import { NextResponse } from "next/server";
import { getMailboxFolder, getWorkspaceFolder, saveMailboxFolder, saveWorkspaceFolder } from "@/src/engine/settings.ts";
import { ensureMailbox } from "@/src/engine/mailbox.ts";
import { jsonError } from "../../_lib/respond.ts";

export async function GET() {
  return NextResponse.json({ workspaceFolder: getWorkspaceFolder(), mailboxFolder: getMailboxFolder() });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { workspaceFolder?: string; mailboxFolder?: string };
  if (!body.workspaceFolder) return jsonError(400, "workspaceFolder is required");
  if (!body.mailboxFolder) return jsonError(400, "mailboxFolder is required");
  try {
    // Creating MAILBOX first means a bad path is rejected before anything is saved.
    ensureMailbox(join(body.mailboxFolder, "MAILBOX"));
  } catch (err) {
    return jsonError(400, `can't create the MAILBOX folder: ${(err as Error).message}`);
  }
  saveWorkspaceFolder(body.workspaceFolder);
  saveMailboxFolder(body.mailboxFolder);
  return NextResponse.json({ workspaceFolder: body.workspaceFolder, mailboxFolder: body.mailboxFolder });
}
