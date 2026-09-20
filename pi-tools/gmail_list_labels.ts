import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { listLabels } from "../src/engine/gmail.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "gmail_list_labels",
  label: "List Labels",
  description: "List the connected Gmail account's labels (system ones like INBOX and the user's own) with their ids.",
  promptSnippet: "gmail_list_labels: list the Gmail account's labels",
  parameters: Type.Object({}),
  async execute() {
    return jsonResult(await listLabels());
  },
});
