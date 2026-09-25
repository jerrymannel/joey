import { getTask } from "../src/engine/task-board.ts";
import { taskHasTool } from "../src/engine/tools.ts";

/** Throws unless the running task (TASK_ID, set by pi-herdr.ts) has this tool enabled on its form — pi registers every tool for every run, so tools with real reach check for themselves. */
export function requireToolEnabled(name: string): void {
  // A yaml task's agent (task-run.ts) gets its own tool list from the task file, exported as JOEY_TOOLS.
  if (process.env.JOEY_TOOLS !== undefined) {
    if (!process.env.JOEY_TOOLS.split(",").includes(name)) throw new Error(`the ${name} tool isn't enabled for this agent — add it to the agent's tools in its task file`);
    return;
  }
  const task = process.env.TASK_ID ? getTask(process.env.TASK_ID) : undefined;
  if (!task || !taskHasTool(task.toolIds, name)) throw new Error(`the ${name} tool isn't enabled for this task — enable it on the task's Tools list`);
}
