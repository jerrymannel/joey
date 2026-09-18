import { randomUUID } from "node:crypto";
import { getDataDb } from "./db.ts";

/** An entry in the AI model picker used by task/automation forms — `value` is what's passed to the harness. */
export interface AiModel {
  id: string;
  name: string;
  value: string;
  /** Custom API base URL for this model, if it's not one of the standard hosted ones. */
  endpoint: string;
  createdAt: string;
}

interface AiModelRow {
  id: string;
  name: string;
  value: string;
  endpoint: string;
  created_at: string;
}

function modelFromRow(row: AiModelRow): AiModel {
  return { id: row.id, name: row.name, value: row.value, endpoint: row.endpoint, createdAt: row.created_at };
}

export function listModels(): AiModel[] {
  const rows = getDataDb().prepare("SELECT * FROM models ORDER BY created_at ASC").all() as AiModelRow[];
  return rows.map(modelFromRow);
}

export function getModel(id: string): AiModel | undefined {
  const row = getDataDb().prepare("SELECT * FROM models WHERE id = ?").get(id) as AiModelRow | undefined;
  return row ? modelFromRow(row) : undefined;
}

/** Task.model stores the raw --model value, not a models-table id, so a custom endpoint has to be looked up by that value. */
export function getModelByValue(value: string): AiModel | undefined {
  const row = getDataDb().prepare("SELECT * FROM models WHERE value = ?").get(value) as AiModelRow | undefined;
  return row ? modelFromRow(row) : undefined;
}

export function createModel(input: { name: string; value: string; endpoint?: string }): AiModel {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDataDb()
    .prepare("INSERT INTO models (id, name, value, endpoint, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, input.name, input.value, input.endpoint ?? "", now);
  return listModels().find((m) => m.id === id)!;
}

export function updateModel(
  id: string,
  patch: Partial<{ name: string; value: string; endpoint: string }>,
): AiModel | undefined {
  const existing = listModels().find((m) => m.id === id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  getDataDb()
    .prepare("UPDATE models SET name = ?, value = ?, endpoint = ? WHERE id = ?")
    .run(next.name, next.value, next.endpoint, id);
  return listModels().find((m) => m.id === id);
}

export function deleteModel(id: string): void {
  getDataDb().prepare("DELETE FROM models WHERE id = ?").run(id);
}
