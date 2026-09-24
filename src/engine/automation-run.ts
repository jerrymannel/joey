import type { Task } from "./task-board.ts";
import { appendRunOutput } from "./run-log.ts";
import { run as runGmailAutomation } from "../../automation/gmail/app.ts";
import { run as runYoutubeAutomation } from "../../automation/youtube/app.ts";
import { runTranscriptionAutomation } from "./transcription-run.ts";
import { log } from "./logger.ts";

/**
 * Dispatches a gmail/youtube/transcription automation's run to its own module (automation/gmail/app.ts,
 * automation/youtube/app.ts, transcription-run.ts) and wires its progress into the run log — same as it
 * always has, just with each service's own logic kept out of the main codebase.
 */
export async function runAutomation(task: Task, runId: string): Promise<void> {
  const alog = log("automation");
  const note = (line: string) => {
    alog.info({ taskId: task.id, runId, service: task.service }, line);
    appendRunOutput(runId, `${line}\n`);
  };

  if (task.service === "gmail") await runGmailAutomation(task, note);
  else if (task.service === "youtube") await runYoutubeAutomation(task, note);
  else if (task.service === "transcription") await runTranscriptionAutomation(task, note);
  else throw new Error(`"${task.service}" is not an automation`);
}
