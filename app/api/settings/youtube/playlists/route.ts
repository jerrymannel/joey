import { NextRequest, NextResponse } from "next/server";
import { fetchMyPlaylists } from "@/src/engine/youtube.ts";
import { jsonError } from "../../../_lib/respond.ts";

/** The connected YouTube account's own playlists (for the New task form's picker). `?account=` chooses which; empty = the first one. */
export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get("account") || undefined;
  try {
    return NextResponse.json(await fetchMyPlaylists(account));
  } catch (err) {
    return jsonError(400, (err as Error).message);
  }
}
