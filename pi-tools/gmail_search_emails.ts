import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { searchEmails } from "../src/engine/gmail.ts";
import { jsonResult } from "./json-result.ts";
import { requireToolEnabled } from "./tool-access.ts";

export default defineTool({
  name: "gmail_search_emails",
  label: "Search Emails",
  description: "Search the connected Gmail account with a Gmail search query.",
  promptSnippet: "gmail_search_emails: search Gmail with a query",
  parameters: Type.Object({
    query: Type.String({ description: 'Gmail search query, e.g. "from:x is:unread"' }),
  }),
  async execute(_toolCallId, params) {
    requireToolEnabled("gmail_search_emails");
    return jsonResult(await searchEmails(params.query));
  },
});
