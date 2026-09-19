import { randomUUID } from "node:crypto";
import { getDataDb } from "./db.ts";

export const TOOL_SERVICES = ["gmail", "youtube", "mailbox"] as const;
export type ToolService = (typeof TOOL_SERVICES)[number];

/** A capability a task can be granted. Read-only catalog — see DEFAULT_TOOLS. */
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

/**
 * The tool catalog, defined here in code and read-only in the UI. Every listing first inserts any entry
 * missing from the table (matched by service + name), so a tool added here — e.g. alongside a new file in
 * pi-tools/ — shows up under Configurations → Tools on an existing database too.
 */
const DEFAULT_TOOLS: { service: ToolService; name: string; description: string }[] = [
  { service: "gmail", name: "Search emails", description: "Search the connected Gmail account with a Gmail search query." },
  { service: "gmail", name: "Read emails", description: "Read the full subject/body/headers of a specific email." },
  { service: "youtube", name: "Search", description: "Search YouTube for videos matching a query." },
  { service: "youtube", name: "List playlist", description: "List the connected account's own playlists." },
  { service: "youtube", name: "Add video to playlist", description: "Add a video to a playlist by ID." },
  { service: "youtube", name: "Show playlist contents", description: "List the videos inside a given playlist." },
  { service: "youtube", name: "Retrieve video details", description: "Get a video's id, title, channel, and description." },
  { service: "mailbox", name: "List agents", description: "List the agents (tasks) you can message, with their ids." },
  { service: "mailbox", name: "Send message", description: "Send a message to another agent's inbox; replies are capped at 5 hops." },
  { service: "mailbox", name: "Send result", description: "Send the run's final output to the RESULTS mailbox, addressed to you. Every pi run is told to do this last." },
];

function syncDefaults(): void {
  const db = getDataDb();
  const exists = db.prepare("SELECT 1 FROM tools WHERE service = ? AND name = ?");
  const insert = db.prepare("INSERT INTO tools (id, service, name, description, created_at) VALUES (?, ?, ?, ?, ?)");
  const now = new Date().toISOString();
  for (const tool of DEFAULT_TOOLS) {
    if (!exists.get(tool.service, tool.name)) insert.run(randomUUID(), tool.service, tool.name, tool.description, now);
  }
}

export function listTools(service?: ToolService): ToolDef[] {
  syncDefaults();
  const rows = (
    service
      ? getDataDb().prepare("SELECT * FROM tools WHERE service = ? ORDER BY created_at ASC").all(service)
      : getDataDb().prepare("SELECT * FROM tools ORDER BY created_at ASC").all()
  ) as ToolRow[];
  return rows.map(toolFromRow);
}
