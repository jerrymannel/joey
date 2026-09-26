import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A run that called `agent_user_input` parks here until the user answers. The waiting `executeRun` and the answer API route run in the
 * same server process, so the resolver is held in memory; the question itself is written to `RUN_DIR/question.json` so the run page can show it.
 * A server restart loses the parked promise — the run is then marked interrupted at startup, like any other in-flight run.
 */
export interface UserQuestion {
  /** Which agent asked. */
  agent: string;
  question: string;
  /** Suggested choices; the user may pick one or type their own. */
  options: string[];
}

export interface UserAnswer {
  choice: string;
  note?: string;
}

const waiters = new Map<string, (a: UserAnswer) => void>();

export function questionPath(runDir: string): string {
  return join(runDir, "question.json");
}

/** Writes the question for the UI and parks until `answerUser` delivers the reply. */
export function askUser(runId: string, runDir: string, q: UserQuestion): Promise<UserAnswer> {
  writeFileSync(/* turbopackIgnore: true */ questionPath(runDir), JSON.stringify(q, null, 2));
  return new Promise((resolve) => {
    waiters.set(runId, (a) => {
      waiters.delete(runId);
      try {
        rmSync(/* turbopackIgnore: true */ questionPath(runDir), { force: true });
      } catch {}
      resolve(a);
    });
  });
}

/** Delivers the user's answer to a parked run; false when nothing is waiting on that run. */
export function answerUser(runId: string, a: UserAnswer): boolean {
  const w = waiters.get(runId);
  if (!w) return false;
  w(a);
  return true;
}

/** The pending question for a run, if it is waiting on one (for the run API). */
export function pendingQuestion(runDir: string): UserQuestion | null {
  const p = questionPath(runDir);
  if (!existsSync(/* turbopackIgnore: true */ p)) return null;
  try {
    return JSON.parse(readFileSync(/* turbopackIgnore: true */ p, "utf8")) as UserQuestion;
  } catch {
    return null;
  }
}
