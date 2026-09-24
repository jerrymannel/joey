import { randomUUID } from "node:crypto";
import { getSettingsDb } from "./db.ts";

/** A saved instruction an automation's "Instruction" field can be prefilled from. */
export interface Prompt {
  id: string;
  name: string;
  content: string;
  createdAt: string;
}

interface PromptRow {
  id: string;
  name: string;
  content: string;
  created_at: string;
}

function promptFromRow(row: PromptRow): Prompt {
  return { id: row.id, name: row.name, content: row.content, createdAt: row.created_at };
}

export function listPrompts(): Prompt[] {
  const rows = getSettingsDb().prepare("SELECT * FROM prompts ORDER BY created_at ASC").all() as PromptRow[];
  return rows.map(promptFromRow);
}

export function getPrompt(id: string): Prompt | undefined {
  const row = getSettingsDb().prepare("SELECT * FROM prompts WHERE id = ?").get(id) as PromptRow | undefined;
  return row ? promptFromRow(row) : undefined;
}

export function createPrompt(input: { name: string; content: string }): Prompt {
  const id = randomUUID();
  const now = new Date().toISOString();
  getSettingsDb()
    .prepare("INSERT INTO prompts (id, name, content, created_at) VALUES (?, ?, ?, ?)")
    .run(id, input.name, input.content, now);
  return listPrompts().find((p) => p.id === id)!;
}

export function updatePrompt(id: string, patch: Partial<{ name: string; content: string }>): Prompt | undefined {
  const existing = listPrompts().find((p) => p.id === id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  getSettingsDb().prepare("UPDATE prompts SET name = ?, content = ? WHERE id = ?").run(next.name, next.content, id);
  return listPrompts().find((p) => p.id === id);
}

export function deletePrompt(id: string): void {
  getSettingsDb().prepare("DELETE FROM prompts WHERE id = ?").run(id);
}
