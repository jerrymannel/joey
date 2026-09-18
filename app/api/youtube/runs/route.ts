import { NextRequest, NextResponse } from "next/server";
import { listYoutubeRuns } from "@/src/engine/youtube-run-log.ts";

export async function GET(request: NextRequest) {
  const folderPath = request.nextUrl.searchParams.get("folderPath") ?? undefined;
  return NextResponse.json(listYoutubeRuns(50, folderPath));
}
