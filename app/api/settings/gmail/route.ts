import { NextRequest, NextResponse } from "next/server";
import { getGmailApp, saveGmailApp, getGmailAccounts } from "@/src/engine/settings.ts";
import { jsonError } from "../../_lib/respond.ts";

export async function GET() {
  const app = getGmailApp();
  return NextResponse.json({
    configured: app !== null,
    clientId: app?.clientId ?? null,
    accounts: getGmailAccounts().map((a) => ({ email: a.email })),
  });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as Partial<{ clientId: string; clientSecret: string }>;
  if (!body.clientId || !body.clientSecret) {
    return jsonError(400, "clientId and clientSecret are required");
  }
  saveGmailApp({ clientId: body.clientId, clientSecret: body.clientSecret });
  return NextResponse.json({ configured: true, clientId: body.clientId, accounts: getGmailAccounts().map((a) => ({ email: a.email })) });
}
