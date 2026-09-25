import { writeFileSync } from "node:fs";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "task_review_verdict",
  label: "Review Verdict",
  description:
    'Finish a review: verdict "approve" when the reviewed work is ready as it is, or "revise" with feedback for its author, who will revise it and send it back to you. Only for review steps; call it once per review.',
  promptSnippet: "task_review_verdict: approve the reviewed work or send it back with feedback",
  parameters: Type.Object({
    verdict: Type.String({ description: '"approve" or "revise"' }),
    feedback: Type.String({ description: "What to change (for revise), or a short note (for approve)" }),
  }),
  async execute(_toolCallId, params) {
    // task-run.ts reads this file after the reviewer's turn; the path is per agent session.
    const file = process.env.JOEY_VERDICT_FILE;
    if (!file) throw new Error("task_review_verdict only works inside a Joey task run");
    const verdict = params.verdict.trim().toLowerCase();
    if (verdict !== "approve" && verdict !== "revise") throw new Error('verdict must be "approve" or "revise"');
    writeFileSync(file, JSON.stringify({ verdict, feedback: params.feedback }));
    return jsonResult({ recorded: verdict });
  },
});
