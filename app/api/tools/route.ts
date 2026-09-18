import { NextRequest, NextResponse } from "next/server";
import { createTool, listTools, TOOL_SERVICES, type ToolService } from "@/src/engine/tools.ts";
import { jsonError } from "../_lib/respond.ts";

export async function GET(request: NextRequest) {
  const service = request.nextUrl.searchParams.get("service") as ToolService | null;
  if (service && !TOOL_SERVICES.includes(service)) return jsonError(400, `service must be one of ${TOOL_SERVICES.join(", ")}`);
  return NextResponse.json(listTools(service ?? undefined));
}

export async function POST(request: Request) {
  const body = (await request.json()) as { service?: ToolService; name?: string; description?: string };
  if (!body.service || !TOOL_SERVICES.includes(body.service)) {
    return jsonError(400, `service must be one of ${TOOL_SERVICES.join(", ")}`);
  }
  if (!body.name) return jsonError(400, "name is required");
  return NextResponse.json(
    createTool({ service: body.service, name: body.name, description: body.description ?? "" }),
    { status: 201 },
  );
}
