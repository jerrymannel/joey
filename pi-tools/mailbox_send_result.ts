import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { deliverResult, idOf, nextHops, ref } from "../src/engine/mailbox.ts";
import { getTask } from "../src/engine/task-board.ts";
import { errMsg, log } from "../src/engine/logger.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "mailbox_send_result",
  label: "Send Result",
  description:
    "End your run by sending one email. With no `to`, it emails your final output to the person who started the run and closes the task. With `to` set to another agent's id (from mailbox_list_agents), it emails that agent instead, handing the work over and triggering its next run (chains are capped at 5 hops). Call it exactly once, as your last action.",
  promptSnippet: "mailbox_send_result: end the run by emailing your result (closes the task) or handing off to another agent",
  parameters: Type.Object({
    subject: Type.String({ description: "One-line summary" }),
    body: Type.String({ description: "The complete final output (or the hand-off message), markdown" }),
    to: Type.Optional(Type.String({ description: "Another agent's id to hand off to; omit to close the task with your result" })),
  }),
  async execute(_toolCallId, params) {
    // TASK_ID / RUN_ID / RESULTS_DIR / MAIL_HOPS are set by pi-herdr.ts in the pane command — this runs in a separate process from the app.
    const id = process.env.TASK_ID ?? "unknown";
    try {
      const dir = process.env.RESULTS_DIR;
      if (!dir) throw new Error("no results folder configured");
      const task = getTask(id);
      const to = params.to ? idOf(params.to) : "";
      if (to && getTask(to)?.service !== "generic") throw new Error(`unknown recipient "${params.to}" — use mailbox_list_agents`);
      const hops = to ? nextHops(process.env.MAIL_HOPS) : 0;
      const { result, emailed, emailError } = await deliverResult(dir, {
        taskId: id,
        from: task ? ref(task.name, id) : id,
        run: process.env.RUN_ID ?? "",
        subject: params.subject,
        body: params.body,
        to,
        hops,
        prompt: to && hops === 0 ? task?.prompt : undefined, // the sender's prompt travels on the first message of a chain only
      });
      return jsonResult({ filed: result.file, emailed, ...(emailError && { emailError }), ...(to && { handedOffTo: to }) });
    } catch (err) {
      // pi hands a thrown error to the model and moves on — this is the only place it's recorded.
      log("mailbox_send_result").error({ taskId: id, run: process.env.RUN_ID, err: errMsg(err) }, "mailbox_send_result failed");
      throw err;
    }
  },
});
