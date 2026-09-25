import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ensureLabels } from "../src/engine/gmail.ts";
import { jsonResult } from "./json-result.ts";
import { requireToolEnabled } from "./tool-access.ts";

export default defineTool({
  name: "gmail_create_label",
  label: "Create Label",
  description: "Create a label in the connected Gmail account. Does nothing if a label with that name already exists.",
  promptSnippet: "gmail_create_label: create a Gmail label if it doesn't exist",
  parameters: Type.Object({ name: Type.String({ description: "Label name" }) }),
  async execute(_toolCallId, params) {
    requireToolEnabled("gmail_create_label");
    return jsonResult({ id: (await ensureLabels([params.name]))[0] });
  },
});
