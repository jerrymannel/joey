import { NextResponse } from "next/server";
import { getMailAccount, getResultsFolder, getWorkspaceFolder, saveResultsFolder, saveWorkspaceFolder } from "@/src/engine/settings.ts";
import { ensureResultsDir } from "@/src/engine/mailbox.ts";
import { jsonError } from "../../_lib/respond.ts";

function settings() {
  return {
    workspaceFolder: getWorkspaceFolder(),
    resultsFolder: getResultsFolder(),
    mailAccount: getMailAccount(),
  };
}

export async function GET() {
  return NextResponse.json(settings());
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { workspaceFolder?: string; resultsFolder?: string };
  if (!body.workspaceFolder) return jsonError(400, "workspaceFolder is required");
  if (!body.resultsFolder) return jsonError(400, "resultsFolder is required");
  try {
    // Creating the folder first means a bad path is rejected before anything is saved.
    ensureResultsDir(body.resultsFolder);
  } catch (err) {
    return jsonError(400, `can't create the results folder: ${(err as Error).message}`);
  }
  saveWorkspaceFolder(body.workspaceFolder);
  saveResultsFolder(body.resultsFolder);
  return NextResponse.json(settings());
}
