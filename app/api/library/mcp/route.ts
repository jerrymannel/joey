import { NextResponse } from "next/server";
import { loadMcpServers } from "@/src/engine/definitions.ts";

/** mcp.json's servers — env values can be tokens, so only their names leave the server. */
export async function GET() {
  const { servers, errors } = loadMcpServers();
  return NextResponse.json({
    servers: Object.entries(servers).map(([name, s]) => ({
      name,
      command: [s.command, ...(s.args ?? [])].filter(Boolean).join(" "),
      url: s.url ?? "",
      envKeys: Object.keys(s.env ?? {}),
    })),
    errors,
  });
}
