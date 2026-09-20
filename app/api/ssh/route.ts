import { NextResponse } from "next/server";
import { createSshConfig, listSshConfigs, type SshInput } from "@/src/engine/ssh.ts";
import { jsonError } from "../_lib/respond.ts";

export async function GET() {
  return NextResponse.json(listSshConfigs());
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(createSshConfig((await request.json()) as SshInput), { status: 201 });
  } catch (err) {
    return jsonError(400, err instanceof Error ? err.message : "invalid SSH configuration");
  }
}
