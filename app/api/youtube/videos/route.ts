import { NextRequest, NextResponse } from "next/server";
import { fetchPlaylistVideos } from "@/src/engine/youtube.ts";
import { jsonError } from "../../_lib/respond.ts";

export async function GET(request: NextRequest) {
  const playlistId = request.nextUrl.searchParams.get("playlistId");
  if (!playlistId) return jsonError(400, "playlistId is required");
  const account = request.nextUrl.searchParams.get("account") ?? undefined;
  try {
    return NextResponse.json(await fetchPlaylistVideos(playlistId, account));
  } catch (err) {
    return jsonError(400, (err as Error).message);
  }
}
