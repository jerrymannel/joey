import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { sortForKms } from "../src/engine/kms-sort.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "kms_sort",
  label: "Sort Items for the KMS",
  description:
    "Decide with Jev (TypeSafe) how to file items in a knowledge base laid out as prompts/kms-builder.md describes: kind (knowledge, company_news or not_kept) and which existing company folder, subject folder (area/subject) and tags (from tags.md). Returns one plan per item, in order. A value of decide means Jev was not confident: judge it yourself. new means none of the existing ones fits: name a new one. - means not needed for that kind.",
  promptSnippet: "kms_sort: decide with Jev how to file items in the KMS (kind, company, subject, tags)",
  parameters: Type.Object({
    kms_folder: Type.String({ description: "Absolute path of the knowledge base folder" }),
    items: Type.Array(
      Type.Object({
        title: Type.String({ description: "The item's own title" }),
        url: Type.String({ description: "The item's link, exactly as in the input (or none)" }),
        content: Type.String({ description: "Everything the input says about the item: summary, key points, deep dive, verdict" }),
        type: Type.Optional(Type.String({ description: "The input's own classification, e.g. Educational or Informational" })),
      }),
      { description: "Every item to file" },
    ),
    model: Type.Optional(Type.String({ description: "Jev model id (default jev-1.13.0)" })),
  }),
  async execute(_toolCallId, params) {
    return jsonResult(await sortForKms(params.items, params.kms_folder, params.model));
  },
});
