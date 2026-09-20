import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { listMailLabels } from "../src/engine/mailbox.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "mailbox_list_labels",
  label: "List Mailbox Labels",
  description: "List the labels of the agent mailbox (the account agents mail each other through) — not the Gmail tools' account. Final results carry the label RESULT and one named after the task.",
  promptSnippet: "mailbox_list_labels: list the agent mailbox's labels",
  parameters: Type.Object({}),
  async execute() {
    return jsonResult(await listMailLabels());
  },
});
