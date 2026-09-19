import { NextRequest, NextResponse } from "next/server";
import { connectGmailAccount } from "@/src/engine/gmail.ts";
import { connectYoutubeAccount } from "@/src/engine/youtube.ts";
import { errMsg, log } from "@/src/engine/logger.ts";
import { saveMailAccount } from "@/src/engine/settings.ts";
import { consumeState } from "../../_oauth-state.ts";

/** Single OAuth callback for every Google-family integration — the `state` token says which service started it. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  const flow = consumeState(state);
  if (!flow) {
    return NextResponse.redirect(`${origin}/integrations?gmailError=${encodeURIComponent("Invalid or expired OAuth state")}`);
  }
  const { service, mailbox } = flow;
  // A mailbox flow returns to General settings, everything else to Integrations.
  const back = (query: string) => NextResponse.redirect(`${origin}${mailbox ? "/settings/general" : "/integrations"}?${query}`);
  if (!code) return back(`${mailbox ? "mail" : service}Error=${encodeURIComponent("Google did not return a code")}`);

  const redirectUri = `${origin}/api/settings/google/callback`;
  try {
    const account =
      service === "gmail" ? await connectGmailAccount(code, redirectUri) : await connectYoutubeAccount(code, redirectUri);
    if (mailbox) saveMailAccount(account.email);
    log("oauth").info({ service, account: account.email, mailbox }, "Google account connected");
    return back(`${mailbox ? "mail" : service}Connected=${encodeURIComponent(account.email)}`);
  } catch (err) {
    log("oauth").error({ service, mailbox, err: errMsg(err) }, "Google account connection failed");
    return back(`${mailbox ? "mail" : service}Error=${encodeURIComponent((err as Error).message)}`);
  }
}
