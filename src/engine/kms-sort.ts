import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { choice, noul, type ChoiceResponse, type NoulResponse, type Question } from "@typesafe-ai/sdk";
import { askJev } from "./typesafe.ts";

/**
 * The `kms_sort` tool's logic: how to file items in the KMS (prompts/kms-builder.md's layout), decided by Jev from the KMS's own closed
 * option sets: knowledge, company news or not kept, and which existing company, subject folder and tags. Anything Jev isn't confident
 * about comes back `decide`, for the calling agent to judge.
 */

/** One item to file, as the agent collected it from its input. A type alias, not an interface, so it is assignable to Jev's JSON state. */
export type Item = {
  title: string;
  url: string;
  /** Everything the input says about the item: summary, key points, deep dive. */
  content: string;
  /** The input's own classification (Educational / Informational), if it gives one. */
  type?: string;
};

export interface Entry {
  key: string;
  about: string;
}

export interface Kms {
  companies: Entry[];
  subjects: Entry[];
  tags: Entry[];
}

// ponytail: fixed thresholds from TypeSafe's "start conservative" advice; tune on a few real runs (or make them params) if too many
// items come back `decide`.
export const CHOICE_MIN = 0.6;
export const TAG_MIN = 0.7;
const MAX_TAGS = 4;

/** `- [<name>](<dir>/AGENT.md): <about>` lines, as the KMS's AGENT.md files list their folders. */
export function indexEntries(text: string): { name: string; dir: string; about: string }[] {
  return [...text.matchAll(/^- \[([^\]]+)\]\(([^/)]+)\/AGENT\.md\):\s*(.*)$/gm)].map((m) => ({ name: m[1], dir: m[2], about: m[3] }));
}

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function readKms(dir: string): Kms {
  const companies = indexEntries(read(join(dir, "companies", "AGENT.md"))).map((e) => ({ key: e.dir, about: `${e.name}: ${e.about}` }));
  const subjects: Entry[] = [];
  const areas = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [];
  for (const area of areas) {
    if (!area.isDirectory() || area.name.startsWith(".") || area.name === "people" || area.name === "companies") continue;
    for (const s of indexEntries(read(join(dir, area.name, "AGENT.md")))) subjects.push({ key: `${area.name}/${s.dir}`, about: s.about });
  }
  const tags = [...read(join(dir, "tags.md")).matchAll(/^- ([a-z0-9-]+):\s*(.*)$/gm)].map((m) => ({ key: m[1], about: m[2] }));
  return { companies, subjects, tags };
}

export function isInformational(item: Item): boolean {
  return /informational/i.test(item.type ?? "");
}

const KINDS = {
  knowledge:
    "It teaches something that will still be true and useful in two years: a concept, mental model, method, architecture, post-mortem, trade-off, worked example, or an analysis that argues its case with reasoning or evidence. Its content must carry that knowledge; reporting that something happened, was released or was announced is not knowledge, however big the event. A company's own engineering post-mortem or a lab's research paper is knowledge.",
  company_news:
    "It reports an event at one named organisation (a company, lab, startup or government agency): a launch, release, price change, funding round, earnings, layoffs, acquisition, partnership, lawsuit, arrest, leadership change, plan or rumour.",
  not_kept:
    "Neither: news about no single organisation (a trend story, a country or policy piece, a market round-up), opinion with no argument or evidence, sponsored content, a job post, or an item with no content.",
};

/** One request's questions for an item: all asked together (fan-out); `decide` reads only the ones its kind needs. */
export function buildQuestions(item: Item, kms: Kms): Record<string, Question> {
  // Rule 1 of kms-builder's <what_to_keep>: an item the summarizer calls Informational is never knowledge, so it isn't offered.
  const { knowledge: _, ...newsKinds } = KINDS;
  const kinds = isInformational(item) ? newsKinds : KINDS;
  const questions: Record<string, Question> = {
    kind: choice("Which kind of item for a personal knowledge base is `item`?", kinds),
    company: choice(
      "Which organisation is `item` mainly about: the one whose action, product or result its headline reports? A product, brand or subsidiary counts as its parent company.",
      {
        ...Object.fromEntries(kms.companies.map((c) => [c.key, c.about])),
        new_company: "A named organisation that is not in this list.",
        no_single_company: "It is not mainly about one organisation.",
      },
    ),
  };
  if (!isInformational(item)) {
    questions.subject = choice("Which subject folder fits the main subject of what `item` teaches?", {
      ...Object.fromEntries(kms.subjects.map((s) => [s.key, s.about])),
      none_fits: "None of these subjects fits its main subject.",
    });
    for (const t of kms.tags) questions[`tag:${t.key}`] = noul(`Does \`item\` substantially touch ${t.key} (${t.about})?`);
  }
  return questions;
}

export interface Plan {
  url: string;
  title: string;
  kind: string;
  confidence?: number;
  company: string;
  subject: string;
  tags: string;
}

type Answers = Record<string, unknown>;

function pick(answer: unknown, special: Record<string, string>): string {
  const a = answer as ChoiceResponse | undefined;
  if (!a || a.confidence < CHOICE_MIN) return "decide";
  return special[a.choice] ?? a.choice;
}

/** The filing decision for one item; anything Jev isn't confident about is left as `decide` for the calling agent. */
export function decide(item: Item, answers: Answers | undefined): Plan {
  const plan: Plan = { url: item.url, title: item.title, kind: "decide", company: "-", subject: "-", tags: "-" };
  const kind = answers?.kind as ChoiceResponse | undefined;
  if (!answers || !kind || kind.confidence < CHOICE_MIN) return { ...plan, confidence: kind?.confidence };
  plan.kind = kind.choice;
  plan.confidence = kind.confidence;
  if (plan.kind === "company_news") plan.company = pick(answers.company, { new_company: "new", no_single_company: "decide" });
  if (plan.kind === "knowledge") {
    plan.subject = pick(answers.subject, { none_fits: "new" });
    const tags = Object.entries(answers)
      .filter(([k, a]) => k.startsWith("tag:") && (a as NoulResponse).noul >= TAG_MIN)
      .sort(([, a], [, b]) => (b as NoulResponse).noul - (a as NoulResponse).noul)
      .slice(0, MAX_TAGS)
      .map(([k]) => k.slice(4));
    plan.tags = tags.length ? tags.join(", ") : "new";
  }
  return plan;
}

/** Asks Jev about every item at once (one request each) and returns one plan per item, in order. An item whose request fails is `decide`. */
export async function sortForKms(items: Item[], kmsDir: string, model?: string, ask: typeof askJev = askJev): Promise<Plan[]> {
  const kms = readKms(kmsDir);
  // ponytail: every item in parallel; the SDK retries 429s. Add a concurrency limit if the org's rate limit starts failing runs.
  const results = await Promise.allSettled(items.map((item) => ask({ item }, buildQuestions(item, kms), model)));
  if (items.length > 0 && results.every((r) => r.status === "rejected")) throw (results[0] as PromiseRejectedResult).reason;
  return results.map((r, i) => decide(items[i], r.status === "fulfilled" ? (r.value.answers as Answers) : undefined));
}
