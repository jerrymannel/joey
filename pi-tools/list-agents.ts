import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { listTasks } from "../src/engine/task-board.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "list_agents",
  label: "List Agents",
  description: "List the agents (tasks) you can message with send_message, with their ids.",
  promptSnippet: "list_agents: list agent ids and names for send_message",
  parameters: Type.Object({}),
  async execute() {
    return jsonResult(listTasks("generic").map((t) => ({ id: t.id, name: t.name })));
  },
});
