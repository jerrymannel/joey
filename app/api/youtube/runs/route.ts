import { NextResponse } from "next/server";
import { listYoutubeRuns } from "@/src/engine/youtube-run-log.ts";

export async function GET() {
  return NextResponse.json(listYoutubeRuns());
}
