import { NextResponse } from "next/server";
import { removeYoutubeAccount } from "@/src/engine/settings.ts";

type Params = { params: Promise<{ email: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { email } = await params;
  removeYoutubeAccount(decodeURIComponent(email));
  return new NextResponse(null, { status: 204 });
}
