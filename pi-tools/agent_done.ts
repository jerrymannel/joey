import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { jsonResult } from "./json-result.ts";
import { appendConversation } from "./conversation.ts";

export default defineTool({
  name: "agent_done",
  label: "Agent Done",
  description:
    "Report that this agent has finished its part of the task: a short message plus the paths of the output files it produced (so Joey and later agents know where they are). Recorded in the run's conversation.md.",
  promptSnippet: "agent_done: report completion with a message and the output file paths",
  parameters: Type.Object({
    message: Type.String({ description: "A short summary of what this agent completed" }),
    files: Type.Optional(Type.Array(Type.String(), { description: "Paths of the output files this agent produced" })),
  }),
  async execute(_toolCallId, params) {
    const files = params.files ?? [];
    const body = `${params.message.trim()}${files.length ? `\n\n**Output files:**\n${files.map((f) => `- ${f}`).join("\n")}` : ""}`;
    const file = appendConversation("done", body);
    return jsonResult({ recorded: file, files });
  },
});
