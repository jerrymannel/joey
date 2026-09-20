import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { labelMail } from "../src/engine/mailbox.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "mailbox_label_mail",
  label: "Label Mailbox Mail",
  description: "Add and/or remove labels (by name) on a mail in the agent mailbox, by its mail id (shown as `id` on the mail you were handed). Labels to add are created if they don't exist yet.",
  promptSnippet: "mailbox_label_mail: add/remove labels on a mail in the agent mailbox",
  parameters: Type.Object({
    id: Type.String({ description: "Mail id" }),
    add: Type.Optional(Type.Array(Type.String(), { description: "Label names to add" })),
    remove: Type.Optional(Type.Array(Type.String(), { description: "Label names to remove" })),
  }),
  async execute(_toolCallId, params) {
    await labelMail(params.id, params.add ?? [], params.remove ?? []);
    return jsonResult({ labelled: params.id });
  },
});
