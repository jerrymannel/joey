import { randomUUID } from "node:crypto";
import { getDataDb } from "./db.ts";

export const TOOL_SERVICES = ["gmail", "youtube"] as const;
export type ToolService = (typeof TOOL_SERVICES)[number];

/** A capability an automation can be granted. Execution isn't wired up yet — see harness.ts's withTools(). */
export interface ToolDef {
  id: string;
  service: ToolService;
  name: string;
  description: string;
  createdAt: string;
}

interface ToolRow {
  id: string;
  service: string;
  name: string;
  description: string;
  created_at: string;
}

function toolFromRow(row: ToolRow): ToolDef {
  return { id: row.id, service: row.service as ToolService, name: row.name, description: row.description, createdAt: row.created_at };
}

/** Seeded once into the table (not hardcoded at read time) so they can be renamed/deleted like any other row. */
const DEFAULT_TOOLS: { service: ToolService; name: string; description: string }[] = [
  { service: "gmail", name: "Search emails", description: "Search the connected Gmail account with a Gmail search query." },
  { service: "gmail", name: "Read emails", description: "Read the full subject/body/headers of a specific email." },
  { service: "youtube", name: "Search", description: "Search YouTube for videos matching a query." },
  { service: "youtube", name: "List playlist", description: "List the connected account's own playlists." },
  { service: "youtube", name: "Add video to playlist", description: "Add a video to a playlist by ID." },
  { service: "youtube", name: "Show playlist contents", description: "List the videos inside a given playlist." },
  { service: "youtube", name: "Retrieve video details", description: "Get a video's id, title, channel, and description." },
];

function seedIfEmpty(): void {
  const db = getDataDb();
  const { count } = db.prepare("SELECT COUNT(*) as count FROM tools").get() as { count: number };
  if (count > 0) return;
  const now = new Date().toISOString();
  const insert = db.prepare("INSERT INTO tools (id, service, name, description, created_at) VALUES (?, ?, ?, ?, ?)");
  for (const tool of DEFAULT_TOOLS) insert.run(randomUUID(), tool.service, tool.name, tool.description, now);
}

export function listTools(service?: ToolService): ToolDef[] {
  seedIfEmpty();
  const rows = (
    service
      ? getDataDb().prepare("SELECT * FROM tools WHERE service = ? ORDER BY created_at ASC").all(service)
      : getDataDb().prepare("SELECT * FROM tools ORDER BY created_at ASC").all()
  ) as ToolRow[];
  return rows.map(toolFromRow);
}

export function getTool(id: string): ToolDef | undefined {
  seedIfEmpty();
  const row = getDataDb().prepare("SELECT * FROM tools WHERE id = ?").get(id) as ToolRow | undefined;
  return row ? toolFromRow(row) : undefined;
}

export function createTool(input: { service: ToolService; name: string; description: string }): ToolDef {
  seedIfEmpty();
  const id = randomUUID();
  const now = new Date().toISOString();
  getDataDb()
    .prepare("INSERT INTO tools (id, service, name, description, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, input.service, input.name, input.description, now);
  return listTools().find((t) => t.id === id)!;
}

export function updateTool(
  id: string,
  patch: Partial<{ name: string; description: string }>,
): ToolDef | undefined {
  const existing = listTools().find((t) => t.id === id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  getDataDb().prepare("UPDATE tools SET name = ?, description = ? WHERE id = ?").run(next.name, next.description, id);
  return listTools().find((t) => t.id === id);
}

export function deleteTool(id: string): void {
  getDataDb().prepare("DELETE FROM tools WHERE id = ?").run(id);
}
