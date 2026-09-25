import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { sendEmail, namedAddress } from "../src/engine/gmail.ts";
import { getMailAccount, getUserEmail } from "../src/engine/settings.ts";
import { errMsg, log } from "../src/engine/logger.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "task_send_result",
  label: "Send Result",
  description:
    "Deliver this task run's final result: it is saved as the run's result and emailed to the user. Call it once, when the result is final.",
  promptSnippet: "task_send_result: save the run's final result and email it to the user",
  parameters: Type.Object({
    subject: Type.String({ description: "One-line summary, used as the email subject" }),
    body: Type.String({ description: "The complete final result, markdown" }),
  }),
  async execute(_toolCallId, params) {
    // RUN_DIR is exported into the agent's shell by task-run.ts — this runs in pi's process, not the app's.
    const runDir = process.env.RUN_DIR;
    if (!runDir) throw new Error("task_send_result only works inside a Joey task run");
    const file = join(runDir, "result.md");
    writeFileSync(file, `# ${params.subject.trim()}\n\n${params.body}\n`);
    const account = getMailAccount();
    const to = getUserEmail();
    if (!account || !to) return jsonResult({ saved: file, emailed: false, reason: "no sending account or user email in General settings" });
    try {
      await sendEmail({ From: namedAddress("Joey", account), To: to, Subject: params.subject.replace(/\s+/g, " ").trim() }, params.body, account);
      return jsonResult({ saved: file, emailed: true, to });
    } catch (err) {
      log("task_send_result").error({ task: process.env.TASK_ID, run: process.env.RUN_ID, err: errMsg(err) }, "the result is saved but emailing it failed");
      return jsonResult({ saved: file, emailed: false, emailError: errMsg(err) });
    }
  },
});
