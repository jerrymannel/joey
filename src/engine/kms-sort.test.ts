import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildQuestions, decide, readKms, sortForKms, type Item } from "./kms-sort.ts";
import type { askJev } from "./typesafe.ts";

function fakeKms(): string {
  const kms = mkdtempSync(join(tmpdir(), "kms-"));
  for (const d of ["companies", "people", "ai/llm-agent"]) mkdirSync(join(kms, d), { recursive: true });
  writeFileSync(join(kms, "companies/AGENT.md"), "# Companies\n\n## Companies\n- [Netflix](netflix/AGENT.md): Streaming company.\n");
  writeFileSync(join(kms, "people/AGENT.md"), "- [Ada](ada/AGENT.md): not a subject\n");
  writeFileSync(join(kms, "ai/AGENT.md"), "# AI\n\n## Subjects\n- [llm-agent](llm-agent/AGENT.md): Agent loops. Also: coding agent\n");
  writeFileSync(join(kms, "tags.md"), "- testing: software testing. Also: qa\n- git: version control.\n");
  return kms;
}

const news: Item = { title: "Netflix Eliminates About 1,000 Jobs", url: "https://n.example/1", content: "Netflix is cutting 1,000 roles.", type: "Informational" };
const edu: Item = { title: "Agentic Verification", url: "https://a.example/2", content: "Verification is the bottleneck.", type: "Educational" };

test("readKms lists companies, subjects and tags; informational items are never offered knowledge", () => {
  const k = readKms(fakeKms());
  assert.deepEqual(k.companies, [{ key: "netflix", about: "Netflix: Streaming company." }]);
  assert.deepEqual(k.subjects, [{ key: "ai/llm-agent", about: "Agent loops. Also: coding agent" }]);
  assert.deepEqual(k.tags.map((t) => t.key), ["testing", "git"]);

  const q1 = buildQuestions(news, k) as Record<string, { criteria: Record<string, unknown> }>;
  assert.deepEqual(Object.keys(q1.kind.criteria), ["company_news", "not_kept"]);
  assert.deepEqual(Object.keys(q1).sort(), ["company", "kind"]);
  const q2 = buildQuestions(edu, k) as Record<string, { criteria: Record<string, unknown> }>;
  assert.deepEqual(Object.keys(q2.kind.criteria), ["knowledge", "company_news", "not_kept"]);
  assert.deepEqual(Object.keys(q2).sort(), ["company", "kind", "subject", "tag:git", "tag:testing"]);
});

const ch = (choice: string, confidence: number) => ({ type: "choice", choice, confidence, probabilities: {} });
const nl = (noul: number) => ({ type: "noul", noul });

test("decide keeps confident answers and leaves the rest to the agent", () => {
  assert.equal(decide(news, { kind: ch("company_news", 0.9), company: ch("netflix", 0.8) }).company, "netflix");
  assert.equal(decide(news, { kind: ch("company_news", 0.9), company: ch("new_company", 0.8) }).company, "new");
  assert.equal(decide(news, { kind: ch("company_news", 0.9), company: ch("netflix", 0.3) }).company, "decide");
  assert.equal(decide(news, { kind: ch("not_kept", 0.4) }).kind, "decide");
  assert.equal(decide(news, undefined).kind, "decide");

  const tags = Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((t, i) => [`tag:${t}`, nl(0.95 - i * 0.05)]));
  const p = decide(edu, { kind: ch("knowledge", 0.8), subject: ch("ai/llm-agent", 0.7), ...tags });
  assert.deepEqual([p.subject, p.tags, p.company], ["ai/llm-agent", "a, b, c, d", "-"]);
  assert.equal(decide(edu, { kind: ch("knowledge", 0.8), subject: ch("none_fits", 0.9), "tag:a": nl(0.2) }).tags, "new");
});

test("sortForKms asks once per item, turns a failed request into decide, and throws when every request fails", async () => {
  const kms = fakeKms();
  const ask = (async (state: { item: Item }) => {
    if (state.item === edu) throw new Error("529 overloaded");
    return { model: "jev-test", answers: { kind: ch("company_news", 0.9), company: ch("netflix", 0.9) }, usage: { input_tokens: 1, output_tokens: 0 } };
  }) as unknown as typeof askJev;
  const plans = await sortForKms([news, edu], kms, undefined, ask);
  assert.deepEqual(plans.map((p) => [p.kind, p.company]), [["company_news", "netflix"], ["decide", "-"]]);
  await assert.rejects(sortForKms([edu], kms, undefined, ask), /529/);
});
