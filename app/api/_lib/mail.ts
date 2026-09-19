import { getTask } from "@/src/engine/task-board.ts";
import { idOf, labelOf, type Mail, type Result } from "@/src/engine/mailbox.ts";

const nameOf = (id: string) => getTask(id)?.name;

/** A result plus what the UI needs: the sending job's id and its `Job name (job id)` label (name resolved for bare ids). */
export function resultView(r: Result) {
  return { ...r, fromId: idOf(r.from), fromLabel: labelOf(r.from, nameOf), toLabel: r.to ? labelOf(r.to, nameOf) : "" };
}

/** An email plus the sending agent's id and a `Job name (job id)` label (the plain From header for a human's / outside mail). */
export function mailView(m: Mail) {
  return { ...m, fromId: m.agent, fromLabel: m.agent ? labelOf(m.agent, nameOf) : m.from };
}
