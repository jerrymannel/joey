import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { sendResult } from "../src/engine/mailbox.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "send_result",
  label: "Send Result",
  description: "Send your final output to the RESULTS mailbox for the person who started this run. Call it once, when you have finished.",
  promptSnippet: "send_result: file your final output in RESULTS when done",
  parameters: Type.Object({
    subject: Type.String({ description: "One-line summary of the result" }),
    body: Type.String({ description: "The complete final output, markdown" }),
  }),
  async execute(_toolCallId, params) {
    // Set by pi-herdr.ts in the pane command — this runs in a separate process from the app.
    const dir = process.env.MESSAGES_DIR;
    if (!dir) throw new Error("no mailbox configured");
    const m = sendResult(dir, { ...params, from: process.env.TASK_ID ?? "unknown", run: process.env.RUN_ID ?? "" });
    return jsonResult({ sent: m.file });
  },
});
