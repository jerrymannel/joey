import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { searchEmails } from "../src/engine/gmail.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "search_emails",
  label: "Search Emails",
  description: "Search the connected Gmail account with a Gmail search query.",
  promptSnippet: "search_emails: search Gmail with a query",
  parameters: Type.Object({
    query: Type.String({ description: 'Gmail search query, e.g. "from:x is:unread"' }),
  }),
  async execute(_toolCallId, params) {
    return jsonResult(await searchEmails(params.query));
  },
});
