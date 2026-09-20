import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { idOf, nextHops, sendMail } from "../src/engine/mailbox.ts";
import { errMsg, log } from "../src/engine/logger.ts";
import { getTask } from "../src/engine/task-board.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "mailbox_send_message",
  label: "Send Message",
  description:
    "Send an email to another agent (find ids with mailbox_list_agents) — the agent mailbox, not the Gmail tools; it arrives at that agent's own address and triggers its next run. To reply to a message you were handed, send to the agent named in its `from`. Chains are capped at 5 hops.",
  promptSnippet: "mailbox_send_message: email another agent by task id",
  parameters: Type.Object({
    to: Type.String({ description: "Recipient agent (task) id, from mailbox_list_agents" }),
    subject: Type.String(),
    body: Type.String({ description: "Message body" }),
  }),
  async execute(_toolCallId, params) {
    // TASK_ID / RUN_ID / MAIL_HOPS are set by pi-herdr.ts in the pane command — this runs in a separate process from the app.
    const toId = idOf(params.to);
    const fromId = process.env.TASK_ID;
    try {
      const recipient = getTask(toId);
      if (recipient?.service !== "generic") throw new Error(`unknown recipient "${params.to}" — use mailbox_list_agents`);
      const sender = fromId ? getTask(fromId) : undefined;
      const hops = nextHops(process.env.MAIL_HOPS);
      const m = await sendMail({
        jobId: toId,
        from: sender?.id ?? "",
        fromName: sender?.name,
        subject: params.subject,
        body: params.body,
        run: process.env.RUN_ID,
        hops,
        prompt: hops === 0 ? sender?.prompt : undefined, // the sender's prompt travels on the first message of a chain only
      });
      return jsonResult({ sent: m.id, hops: m.hops });
    } catch (err) {
      // pi hands a thrown error to the model and moves on — this is the only place it's recorded.
      log("mailbox_send_message").error({ to: toId, from: fromId, run: process.env.RUN_ID, err: errMsg(err) }, "mailbox_send_message failed");
      throw err;
    }
  },
});
