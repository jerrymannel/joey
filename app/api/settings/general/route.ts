import { NextResponse } from "next/server";
import { getMailAccount, getUserEmail, getWorkspaceFolder, saveUserEmail, saveWorkspaceFolder } from "@/src/engine/settings.ts";
import { jsonError } from "../../_lib/respond.ts";

function settings() {
  return {
    workspaceFolder: getWorkspaceFolder(),
    mailAccount: getMailAccount(),
    userEmail: getUserEmail() ?? "",
  };
}

export async function GET() {
  return NextResponse.json(settings());
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { workspaceFolder?: string; userEmail?: string };
  if (!body.workspaceFolder) return jsonError(400, "workspaceFolder is required");
  const userEmail = (body.userEmail ?? "").trim();
  if (userEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) return jsonError(400, "userEmail isn't a valid email address");
  saveWorkspaceFolder(body.workspaceFolder);
  saveUserEmail(userEmail);
  return NextResponse.json(settings());
}
