import { randomUUID } from "node:crypto";
import { getDataDb } from "./db.ts";

/** An entry in the AI model picker used by task/automation forms — `value` is what's passed to the harness. */
export interface AiModel {
  id: string;
  name: string;
  value: string;
  /** Custom API base URL for this model, if it's not one of the standard hosted ones. */
  endpoint: string;
  /** Disabled models stay in the table but are hidden from the task/automation model pickers. */
  enabled: boolean;
  /** One of DEFAULT_MODELS — can be disabled, but not edited or deleted. */
  isDefault: boolean;
  createdAt: string;
}

interface AiModelRow {
  id: string;
  name: string;
  value: string;
  endpoint: string;
  enabled: number;
  created_at: string;
}

function modelFromRow(row: AiModelRow): AiModel {
  return {
    id: row.id,
    name: row.name,
    value: row.value,
    endpoint: row.endpoint,
    enabled: row.enabled === 1,
    isDefault: DEFAULT_VALUES.has(row.value),
    createdAt: row.created_at,
  };
}

/** pi's own `provider/id` model catalog (`pi --list-models`) — seeded once into the table (not hardcoded at read time). Protected: they can be disabled but never edited or deleted. A default is recognised by its `value`, so no extra column/backfill is needed for databases seeded before this was protected. */
const DEFAULT_MODELS: { name: string; value: string }[] = [
  "antigravity/gemini-3-8-flash",
  "antigravity/gemini-3-7-flash",
  "antigravity/gemini-3-6-flash",
  "antigravity/gemini-3-1-pro",
  "claude-bridge/claude-opus-5",
  "claude-bridge/claude-opus-4-8",
  "claude-bridge/claude-opus-4-7",
  "claude-bridge/claude-opus-4-6",
  "claude-bridge/claude-sonnet-5",
  "claude-bridge/claude-sonnet-4-6",
  "claude-bridge/claude-haiku-4-5",
].map((value) => ({ name: value, value }));
const DEFAULT_VALUES = new Set(DEFAULT_MODELS.map((m) => m.value));

function seedIfEmpty(): void {
  const db = getDataDb();
  const { count } = db.prepare("SELECT COUNT(*) as count FROM models").get() as { count: number };
  if (count > 0) return;
  const now = new Date().toISOString();
  const insert = db.prepare("INSERT INTO models (id, name, value, endpoint, created_at) VALUES (?, ?, ?, '', ?)");
  for (const model of DEFAULT_MODELS) insert.run(randomUUID(), model.name, model.value, now);
}

export function listModels(): AiModel[] {
  seedIfEmpty();
  const rows = getDataDb().prepare("SELECT * FROM models ORDER BY created_at ASC").all() as AiModelRow[];
  return rows.map(modelFromRow);
}

export function getModel(id: string): AiModel | undefined {
  seedIfEmpty();
  const row = getDataDb().prepare("SELECT * FROM models WHERE id = ?").get(id) as AiModelRow | undefined;
  return row ? modelFromRow(row) : undefined;
}

/** Task.model stores the raw --model value, not a models-table id, so a custom endpoint has to be looked up by that value. */
export function getModelByValue(value: string): AiModel | undefined {
  seedIfEmpty();
  const row = getDataDb().prepare("SELECT * FROM models WHERE value = ?").get(value) as AiModelRow | undefined;
  return row ? modelFromRow(row) : undefined;
}

export function createModel(input: { name: string; value: string; endpoint?: string }): AiModel {
  seedIfEmpty();
  const id = randomUUID();
  const now = new Date().toISOString();
  getDataDb()
    .prepare("INSERT INTO models (id, name, value, endpoint, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, input.name, input.value, input.endpoint ?? "", now);
  return listModels().find((m) => m.id === id)!;
}

export function updateModel(
  id: string,
  patch: Partial<{ name: string; value: string; endpoint: string; enabled: boolean }>,
): AiModel | undefined {
  const existing = listModels().find((m) => m.id === id);
  if (!existing) return undefined;
  const next = { ...existing, ...(existing.isDefault ? { enabled: patch.enabled } : patch) };
  getDataDb()
    .prepare("UPDATE models SET name = ?, value = ?, endpoint = ?, enabled = ? WHERE id = ?")
    .run(next.name, next.value, next.endpoint, (next.enabled ?? existing.enabled) ? 1 : 0, id);
  return listModels().find((m) => m.id === id);
}

export function deleteModel(id: string): void {
  if (getModel(id)?.isDefault) throw new Error("default models can't be deleted");
  getDataDb().prepare("DELETE FROM models WHERE id = ?").run(id);
}

/** pi's provider name for a custom-endpoint model — see pi-herdr.ts's `syncPiCustomModels`. */
export function piProviderName(model: AiModel): string {
  return `joey-${model.id}`;
}

/** What to pass pi as `--model` for a custom-endpoint model: pi only knows models registered under a provider in its models.json, so a bare `value` isn't enough. */
export function piModelRef(model: AiModel): string {
  return `${piProviderName(model)}/${model.value}`;
}
