import { existsSync, readFileSync } from "node:fs";
import { getTaskRun, listRunSteps } from "@/src/engine/task-runs.ts";

type Params = { params: Promise<{ id: string; idx: string }> };

/**
 * Server-sent live logs for one step: tails its `.log` file (script steps redirect stdout there; agent steps append each turn).
 * Emits `{ text }` frames as the file grows and a final `{ done: <status> }` when the step is no longer running. Closes on client disconnect.
 */
export async function GET(request: Request, { params }: Params) {
  const { id, idx } = await params;
  const i = Number(idx);
  const run = getTaskRun(id);
  const stepOf = () => listRunSteps(id).find((s) => s.idx === i);
  if (!run || !Number.isInteger(i) || !stepOf()) return new Response("run or step not found", { status: 404 });

  const enc = new TextEncoder();
  const frame = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let offset = 0; // characters already sent
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", close);
      const started = Date.now();
      try {
        while (!closed) {
          const step = stepOf();
          const logPath = step?.outputFile ? step.outputFile.replace(/\.md$/, ".log") : null;
          // The whole file is re-read each tick — fine for these logs; revisit if a step ever writes megabytes. ponytail: full re-read, chunk it if logs get large.
          if (logPath && existsSync(/* turbopackIgnore: true */ logPath)) {
            const text = readFileSync(/* turbopackIgnore: true */ logPath, "utf8");
            if (text.length > offset) {
              controller.enqueue(frame({ text: text.slice(offset) }));
              offset = text.length;
            }
          }
          const status = step?.status;
          if (status !== "running" && status !== "pending") {
            controller.enqueue(frame({ done: status ?? "gone" }));
            break;
          }
          if (Date.now() - started > 60 * 60 * 1000) {
            controller.enqueue(frame({ done: "timeout" }));
            break;
          }
          await new Promise((r) => setTimeout(r, 700));
        }
      } catch (err) {
        try {
          controller.enqueue(frame({ error: (err as Error).message }));
        } catch {}
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
