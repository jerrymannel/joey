import { NextResponse } from "next/server";
import { getDownloadJob } from "@/src/engine/youtube-download.ts";
import { jsonError } from "../../../_lib/respond.ts";

type Params = { params: Promise<{ videoId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { videoId } = await params;
  const job = getDownloadJob(videoId);
  if (!job) return jsonError(404, "no download job for this video");
  return NextResponse.json({ videoId, ...job });
}
