import { writeFileSync } from "node:fs";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "agent_user_input",
  label: "Ask The User",
  description:
    "Ask the user a question and wait for their answer. The run pauses until they reply on the run page, then their answer is sent to you as the next message. After calling this, STOP your turn and wait — do not guess the answer.",
  promptSnippet: "agent_user_input: ask the user a question (with options) and pause the run until they answer",
  parameters: Type.Object({
    question: Type.String({ description: "The question to put to the user" }),
    options: Type.Optional(Type.Array(Type.String(), { description: "Suggested answers to offer as buttons; the user may still type their own" })),
  }),
  async execute(_toolCallId, params) {
    // task-run.ts watches this file after the turn settles, surfaces the question on the run page, and resumes with the answer.
    const file = process.env.JOEY_QUESTION_FILE;
    if (!file) throw new Error("agent_user_input only works inside a Joey task run");
    writeFileSync(file, JSON.stringify({ agent: process.env.JOEY_AGENT || "agent", question: params.question, options: params.options ?? [] }));
    return jsonResult({ asked: true, note: "The question was posted to the user. End your turn now — their answer arrives as your next message." });
  },
});
