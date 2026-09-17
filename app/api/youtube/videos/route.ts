import { NextRequest, NextResponse } from "next/server";
import { fetchPlaylistVideos } from "@/src/engine/youtube.ts";
import { getYoutubePlaylistId } from "@/src/engine/settings.ts";
import { jsonError } from "../../_lib/respond.ts";

export async function GET(request: NextRequest) {
  const playlistId = getYoutubePlaylistId();
  if (!playlistId) return jsonError(400, "Set a playlist ID in Settings first");
  const account = request.nextUrl.searchParams.get("account") ?? undefined;
  try {
    return NextResponse.json(await fetchPlaylistVideos(playlistId, account));
  } catch (err) {
    return jsonError(400, (err as Error).message);
  }
}
