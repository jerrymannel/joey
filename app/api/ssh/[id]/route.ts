import { NextResponse } from "next/server";
import { deleteSshConfig, getSshConfig, updateSshConfig, type SshInput } from "@/src/engine/ssh.ts";
import { jsonError } from "../../_lib/respond.ts";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const config = getSshConfig((await params).id);
  return config ? NextResponse.json(config) : jsonError(404, "SSH configuration not found");
}

/** Full replace; leaving `secret` empty keeps the stored password / key (only while the auth method is unchanged). */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const updated = updateSshConfig((await params).id, (await request.json()) as SshInput);
    return updated ? NextResponse.json(updated) : jsonError(404, "SSH configuration not found");
  } catch (err) {
    return jsonError(400, err instanceof Error ? err.message : "invalid SSH configuration");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  deleteSshConfig((await params).id);
  return new NextResponse(null, { status: 204 });
}
