import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { sendMessage } from "../src/engine/mailbox.ts";
import { getTask } from "../src/engine/task-board.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "send_message",
  label: "Send Message",
  description:
    "Send a message to another agent's inbox (find ids with list_agents). To reply, pass the `thread` id shown on the message you got; replies are capped at 5 hops.",
  promptSnippet: "send_message: send a message to another agent by task id",
  parameters: Type.Object({
    to: Type.String({ description: "Recipient agent (task) id, from list_agents" }),
    subject: Type.String(),
    body: Type.String({ description: "Message body, markdown" }),
    thread: Type.Optional(Type.String({ description: "Thread id of the message being replied to" })),
  }),
  async execute(_toolCallId, params) {
    // Set by harness.ts/pi-herdr.ts in the pane command — this runs in a separate process from the app.
    const dir = process.env.MESSAGES_DIR;
    if (!dir) throw new Error("no mailbox configured");
    if (getTask(params.to)?.service !== "generic") throw new Error(`unknown recipient "${params.to}" — use list_agents`);
    const m = sendMessage(dir, { ...params, from: process.env.TASK_ID ?? "human" });
    return jsonResult({ sent: m.file, thread: m.thread, hops: m.hops });
  },
});
