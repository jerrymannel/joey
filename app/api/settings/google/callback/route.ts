import { NextRequest, NextResponse } from "next/server";
import { connectGmailAccount } from "@/src/engine/gmail.ts";
import { connectYoutubeAccount } from "@/src/engine/youtube.ts";
import { consumeState } from "../../_oauth-state.ts";

/** Single OAuth callback for every Google-family integration — the `state` token says which service started it. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  const service = consumeState(state);
  if (!service) {
    return NextResponse.redirect(`${origin}/integrations?gmailError=${encodeURIComponent("Invalid or expired OAuth state")}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/integrations?${service}Error=${encodeURIComponent("Google did not return a code")}`);
  }

  const redirectUri = `${origin}/api/settings/google/callback`;
  try {
    const account =
      service === "gmail" ? await connectGmailAccount(code, redirectUri) : await connectYoutubeAccount(code, redirectUri);
    return NextResponse.redirect(`${origin}/integrations?${service}Connected=${encodeURIComponent(account.email)}`);
  } catch (err) {
    return NextResponse.redirect(`${origin}/integrations?${service}Error=${encodeURIComponent((err as Error).message)}`);
  }
}
