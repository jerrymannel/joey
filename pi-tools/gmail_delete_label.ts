import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { deleteLabel } from "../src/engine/gmail.ts";
import { jsonResult } from "./json-result.ts";
import { requireToolEnabled } from "./tool-access.ts";

export default defineTool({
  name: "gmail_delete_label",
  label: "Delete Label",
  description: "Delete one of the user's own Gmail labels by name. The emails keep existing, they just lose the label. System labels can't be deleted.",
  promptSnippet: "gmail_delete_label: delete a Gmail label by name",
  parameters: Type.Object({ name: Type.String({ description: "Label name" }) }),
  async execute(_toolCallId, params) {
    requireToolEnabled("gmail_delete_label");
    return jsonResult({ deleted: await deleteLabel(params.name) });
  },
});
