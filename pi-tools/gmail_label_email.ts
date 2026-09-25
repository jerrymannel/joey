import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { labelEmail } from "../src/engine/gmail.ts";
import { jsonResult } from "./json-result.ts";
import { requireToolEnabled } from "./tool-access.ts";

export default defineTool({
  name: "gmail_label_email",
  label: "Label Email",
  description: "Add and/or remove labels (by name) on a specific email by its Gmail message id. Labels to add are created if they don't exist yet.",
  promptSnippet: "gmail_label_email: add/remove labels on an email by id",
  parameters: Type.Object({
    id: Type.String({ description: "Gmail message id" }),
    add: Type.Optional(Type.Array(Type.String(), { description: "Label names to add" })),
    remove: Type.Optional(Type.Array(Type.String(), { description: "Label names to remove" })),
  }),
  async execute(_toolCallId, params) {
    requireToolEnabled("gmail_label_email");
    await labelEmail(params.id, params.add ?? [], params.remove ?? []);
    return jsonResult({ labelled: params.id });
  },
});
