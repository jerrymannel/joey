import { NextRequest, NextResponse } from "next/server";
import { fetchPlaylistVideos } from "@/src/engine/youtube.ts";
import { getYoutubePlaylistId } from "@/src/engine/settings.ts";
import { describeDownloadCommands } from "@/src/engine/youtube-download.ts";
import { jsonError } from "../../_lib/respond.ts";

export async function GET(request: NextRequest) {
  const playlistId = getYoutubePlaylistId();
  if (!playlistId) return jsonError(400, "Set a playlist ID in Settings first");
  const workspaceFolder = request.nextUrl.searchParams.get("workspaceFolder");
  if (!workspaceFolder) return jsonError(400, "Set a workspace folder first");

  try {
    const videos = await fetchPlaylistVideos(playlistId);
    return NextResponse.json(
      videos.map((v) => ({
        videoId: v.videoId,
        title: v.title,
        ...describeDownloadCommands(v.videoId, workspaceFolder),
      })),
    );
  } catch (err) {
    return jsonError(400, (err as Error).message);
  }
}
