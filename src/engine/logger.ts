import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import pino from "pino";
import pretty from "pino-pretty";

/**
 * The app's one logger (pino), used everywhere except the HTTP layer. Two sinks, each with its own level:
 *  - console, pretty-printed (pino-pretty): `LOG_LEVEL`, default `info`. Turn it to `debug`/`trace` to watch closely.
 *  - file, JSON lines: `LOG_FILE` (default `data/joey.log`), level `LOG_FILE_LEVEL`, default `debug` — so after
 *    something went wrong there's more detail to read back (`npm run logs`, `npm run logs -- -L warn`).
 * `LOG_CONSOLE=off` drops the console sink — pi's tools run inside pi's own terminal, where log lines don't belong
 * (agent-session.ts sets it for every agent, plus an absolute `LOG_FILE`, since their cwd isn't this repo). Under `npm test` it's silent
 * unless `LOG_LEVEL` is set. Levels: trace < debug < info < warn < error < fatal.
 */
const consoleLevel = process.env.LOG_LEVEL || (process.env.NODE_TEST_CONTEXT ? "silent" : "info");
const fileLevel = process.env.LOG_FILE_LEVEL || "debug";

function build(): pino.Logger {
  if (consoleLevel === "silent") return pino({ level: "silent" });
  const streams: pino.StreamEntry[] = [];
  if (process.env.LOG_CONSOLE !== "off") {
    // A synchronous stream, not pino's worker-thread `transport`, which doesn't survive Next's bundling.
    streams.push({ level: consoleLevel as pino.Level, stream: pretty({ colorize: true, translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname", sync: true }) });
  }
  // A local file path, not a project asset — turbopackIgnore stops Turbopack tracing the repo for it (same as db.ts).
  const file = resolve(/* turbopackIgnore: true */ process.cwd(), process.env.LOG_FILE ?? "data/joey.log");
  mkdirSync(dirname(file), { recursive: true });
  streams.push({ level: fileLevel as pino.Level, stream: pino.destination({ dest: file, append: true, sync: true, mkdir: true }) });
  const lowest = Math.min(...streams.map((s) => pino.levels.values[s.level as string]));
  return pino({ level: pino.levels.labels[lowest] }, pino.multistream(streams));
}

export const logger = build();

/** A child logger tagged `{ mod }` — one per module, so a line says where it came from. */
export const log = (mod: string): pino.Logger => logger.child({ mod });

/** The message of anything thrown. */
export const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));
