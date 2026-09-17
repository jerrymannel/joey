import { NextRequest, NextResponse } from "next/server";
import { startDownload } from "@/src/engine/youtube-download.ts";
import { jsonError } from "../../_lib/respond.ts";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<{ videoId: string; workspaceFolder: string }>;
  if (!body.videoId || !body.workspaceFolder) {
    return jsonError(400, "videoId and workspaceFolder are required");
  }
  startDownload(body.videoId, body.workspaceFolder);
  return NextResponse.json({ videoId: body.videoId, state: "queued", log: "" }, { status: 202 });
}
