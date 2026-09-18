import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readEmail } from "../src/engine/gmail.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "read_email",
  label: "Read Email",
  description: "Read the full subject/body/headers of a specific email by its Gmail message id.",
  promptSnippet: "read_email: read a specific email by id",
  parameters: Type.Object({ id: Type.String({ description: "Gmail message id" }) }),
  async execute(_toolCallId, params) {
    return jsonResult(await readEmail(params.id));
  },
});
