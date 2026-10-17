import { defineTool } from "@earendil-works/pi-coding-agent";
import type { Questions } from "@typesafe-ai/sdk";
import { Type } from "typebox";
import { askJev } from "../src/engine/typesafe.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "typesafe_ask",
  label: "Ask Jev",
  description:
    'Ask TypeSafe\'s Jev typed questions about some state and get calibrated answers back, instead of judging yourself. Question types: "choice" (pick one of the criteria\'s labels: criteria is { label: description | null }; answer has choice, probabilities, confidence 0-1), "noul" (yes/no: optional criteria { "true": ..., "false": ... }; answer is noul, the probability of yes) and "score" (criteria is an ordered list of level descriptions, lowest first; answer has score, probabilities, confidence). Ask all the questions about the same state in one call. Question ids are not shown to Jev, so the instructions must be complete; refer to parts of the state as `field.path` in backticks. Treat confidence under about 0.6 (or a noul near 0.5) as unsure. Jev only judges: it never writes text.',
  promptSnippet: "typesafe_ask: ask Jev typed choice / yes-no / score questions about some content, with calibrated probabilities",
  parameters: Type.Object({
    state: Type.Unknown({ description: "What to judge: text, or a JSON object/array with named fields" }),
    questions: Type.Record(
      Type.String(),
      Type.Object({
        type: Type.Union([Type.Literal("choice"), Type.Literal("noul"), Type.Literal("score")]),
        instructions: Type.Unknown({ description: "The question, as text or a JSON object" }),
        criteria: Type.Optional(Type.Unknown({ description: "choice: { label: description | null }; score: [level descriptions]; noul: optional { true, false }" })),
      }),
      { description: "Questions keyed by an id of your choosing; answers come back under the same ids" },
    ),
    model: Type.Optional(Type.String({ description: "Jev model id (default jev-1.13.0)" })),
  }),
  async execute(_toolCallId, params) {
    const res = await askJev(params.state as never, params.questions as Questions, params.model);
    return jsonResult({ model: res.model, answers: res.answers, usage: res.usage });
  },
});
