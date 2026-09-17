import { NextRequest, NextResponse } from "next/server";
import { buildGmailAuthUrl } from "@/src/engine/gmail.ts";
import { buildYoutubeAuthUrl } from "@/src/engine/youtube.ts";
import { createState, type GoogleService } from "../../_oauth-state.ts";

/** Single "Connect account" entry point for every Google-family integration — pass ?service=gmail|youtube. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const service = request.nextUrl.searchParams.get("service");
  if (service !== "gmail" && service !== "youtube") {
    return NextResponse.redirect(`${origin}/integrations?gmailError=${encodeURIComponent("Unknown Google service")}`);
  }

  const redirectUri = `${origin}/api/settings/google/callback`;
  try {
    const state = createState(service satisfies GoogleService);
    const url = service === "gmail" ? buildGmailAuthUrl(redirectUri, state) : buildYoutubeAuthUrl(redirectUri, state);
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.redirect(
      `${origin}/integrations?${service}Error=${encodeURIComponent((err as Error).message)}`,
    );
  }
}
