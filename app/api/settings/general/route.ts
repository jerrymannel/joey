import { NextResponse } from "next/server";
import { getWorkspaceFolder, saveWorkspaceFolder } from "@/src/engine/settings.ts";
import { jsonError } from "../../_lib/respond.ts";

export async function GET() {
  return NextResponse.json({ workspaceFolder: getWorkspaceFolder() });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { workspaceFolder?: string };
  if (!body.workspaceFolder) return jsonError(400, "workspaceFolder is required");
  saveWorkspaceFolder(body.workspaceFolder);
  return NextResponse.json({ workspaceFolder: body.workspaceFolder });
}
