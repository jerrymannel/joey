import { TypeSafeClient, type EntryType, type Questions, type SystemOneResult } from "@typesafe-ai/sdk";
import { log } from "./logger.ts";

const tlog = log("typesafe");

/** Pinned rather than `jev-latest` (an alias that moves on every release), so confidence thresholds stay tuned to one model. */
export const DEFAULT_JEV_MODEL = "jev-1.13.0";

let client: TypeSafeClient | undefined;

/**
 * One request to TypeSafe's Jev (a System One model): state plus typed questions (choice / noul / score), answered with calibrated
 * probabilities. Needs TYPESAFE_API_KEY (in .env.local); TYPESAFE_DEFAULT_MODEL overrides the model. The SDK retries 429/5xx itself.
 */
export async function askJev<const Q extends Questions>(state: EntryType, questions: Q, model?: string): Promise<SystemOneResult<Q>> {
  if (!process.env.TYPESAFE_API_KEY) throw new Error("TYPESAFE_API_KEY is not set: add it to the repo's .env.local");
  client ??= new TypeSafeClient({ defaultModel: process.env.TYPESAFE_DEFAULT_MODEL ?? DEFAULT_JEV_MODEL, timeout: 60_000 });
  const res = await client.systemOne({ state, questions, model });
  tlog.debug({ model: res.model, questions: Object.keys(questions).length, inputTokens: res.usage.input_tokens }, "jev answered");
  return res;
}
