import { NextRequest, NextResponse } from "next/server";
import {
  saveYoutubeApp,
  getYoutubeAccounts,
  getYoutubePlaylistId,
  saveYoutubePlaylistId,
  usesGmailApp,
  setUsesGmailApp,
  resolveYoutubeApp,
} from "@/src/engine/settings.ts";
import { jsonError } from "../../_lib/respond.ts";

function status() {
  const app = resolveYoutubeApp();
  return {
    configured: app !== null,
    usesGmailApp: usesGmailApp("youtube"),
    clientId: app?.clientId ?? null,
    accounts: getYoutubeAccounts().map((a) => ({ email: a.email })),
    playlistId: getYoutubePlaylistId(),
  };
}

export async function GET() {
  return NextResponse.json(status());
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as Partial<{
    clientId: string;
    clientSecret: string;
    playlistId: string;
    usesGmailApp: boolean;
  }>;

  if (body.usesGmailApp !== undefined) setUsesGmailApp("youtube", body.usesGmailApp);

  // Only touch the stored app when the caller actually submitted credentials — a bare
  // { usesGmailApp } toggle shouldn't require re-entering (or force-clearing) the client ID/secret.
  if (!usesGmailApp("youtube") && body.clientId !== undefined) {
    if (!body.clientId || !body.clientSecret) {
      return jsonError(400, "clientId and clientSecret are required unless using Gmail's OAuth client");
    }
    saveYoutubeApp({ clientId: body.clientId, clientSecret: body.clientSecret });
  }
  if (body.playlistId !== undefined) saveYoutubePlaylistId(body.playlistId);

  return NextResponse.json(status());
}
