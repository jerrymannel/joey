import { getTask } from "../src/engine/task-board.ts";
import { taskHasTool } from "../src/engine/tools.ts";

/** Throws unless the running task (TASK_ID, set by pi-herdr.ts) has this tool enabled on its form — pi registers every tool for every run, so tools with real reach check for themselves. */
export function requireToolEnabled(name: string): void {
  const task = process.env.TASK_ID ? getTask(process.env.TASK_ID) : undefined;
  if (!task || !taskHasTool(task.toolIds, name)) throw new Error(`the ${name} tool isn't enabled for this task — enable it on the task's Tools list`);
}
