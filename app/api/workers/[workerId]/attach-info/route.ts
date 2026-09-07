import { NextResponse } from "next/server";
import { getWorker } from "@/src/engine/run-log.ts";
import { agentRead, attachCommand } from "@/src/herdr/client.ts";
import { jsonError } from "../../../_lib/respond.ts";

type Params = { params: Promise<{ workerId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { workerId } = await params;
  const worker = getWorker(workerId);
  if (!worker) return jsonError(404, "worker not found");
  if (!worker.herdrPaneId) return jsonError(409, "worker has no pane yet");

  const recentOutput = await agentRead(worker.herdrPaneId, { lines: 80 });
  return NextResponse.json({
    herdrPaneId: worker.herdrPaneId,
    attachCommand: attachCommand(worker.herdrPaneId),
    recentOutput,
  });
}
