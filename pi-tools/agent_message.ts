import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { jsonResult } from "./json-result.ts";
import { appendConversation } from "./conversation.ts";

export default defineTool({
  name: "agent_message",
  label: "Agent Message",
  description:
    "Post a message to the run's shared conversation (conversation.md) — a chat box the other agents in this run can read. Give the run id (RUN_ID) and your message.",
  promptSnippet: "agent_message: post a message to the run's shared conversation for other agents",
  parameters: Type.Object({
    task_run_id: Type.String({ description: "The task run id (RUN_ID) this message belongs to" }),
    instructions: Type.String({ description: "The message / instructions to post for the other agents" }),
  }),
  async execute(_toolCallId, params) {
    const file = appendConversation("message", params.instructions);
    return jsonResult({ posted: file });
  },
});
