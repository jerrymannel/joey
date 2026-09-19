import { NextRequest, NextResponse } from "next/server";
import { listTools, TOOL_SERVICES, type ToolService } from "@/src/engine/tools.ts";
import { jsonError } from "../_lib/respond.ts";

export async function GET(request: NextRequest) {
  const service = request.nextUrl.searchParams.get("service") as ToolService | null;
  if (service && !TOOL_SERVICES.includes(service)) return jsonError(400, `service must be one of ${TOOL_SERVICES.join(", ")}`);
  return NextResponse.json(listTools(service ?? undefined));
}
