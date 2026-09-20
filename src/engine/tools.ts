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
  /** Granted to every task without being picked (the mailbox tools); never stored in a task's `toolIds`. */
  alwaysOn: boolean;
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
  return { id: row.id, service: row.service as ToolService, name: row.name, description: row.description, alwaysOn: row.service === "mailbox", createdAt: row.created_at };
}

/**
 * The tool catalog, defined here in code and read-only in the UI. Every listing first inserts any entry
 * missing from the table (matched by service + name), so a tool added here — e.g. alongside a new file in
 * pi-tools/ — shows up under Configurations → Tools on an existing database too. A tool's name is
 * its real pi tool name (and its pi-tools/ file name) and must start with its service (`gmail_`, `youtube_`, `mailbox_`); `renamedFrom` carries an old row over (keeping its id).
 */
const DEFAULT_TOOLS: { service: ToolService; name: string; description: string; renamedFrom?: string }[] = [
  { service: "gmail", name: "gmail_search_emails", renamedFrom: "Search emails", description: "Search the connected Gmail account with a Gmail search query." },
  { service: "gmail", name: "gmail_read_email", renamedFrom: "Read emails", description: "Read the full subject/body/headers of a specific email." },
  { service: "gmail", name: "gmail_list_labels", description: "List the connected Gmail account's labels." },
  { service: "gmail", name: "gmail_create_label", description: "Create a Gmail label (a no-op if it already exists)." },
  { service: "gmail", name: "gmail_delete_label", description: "Delete one of the user's own Gmail labels by name; emails keep existing." },
  { service: "gmail", name: "gmail_label_email", description: "Add and/or remove labels on an email by id; labels to add are created if missing." },
  { service: "youtube", name: "youtube_search", renamedFrom: "Search", description: "Search YouTube for videos matching a query." },
  { service: "youtube", name: "youtube_list_playlists", renamedFrom: "List playlist", description: "List the connected account's own playlists." },
  { service: "youtube", name: "youtube_add_video_to_playlist", renamedFrom: "Add video to playlist", description: "Add a video to a playlist by ID." },
  { service: "youtube", name: "youtube_show_playlist_contents", renamedFrom: "Show playlist contents", description: "List the videos inside a given playlist." },
  { service: "youtube", name: "youtube_retrieve_video_details", renamedFrom: "Retrieve video details", description: "Get a video's id, title, channel, and description." },
  { service: "mailbox", name: "mailbox_list_agents", renamedFrom: "List agents", description: "List the agents (tasks) you can message, with their ids." },
  { service: "mailbox", name: "mailbox_send_message", renamedFrom: "Send message", description: "Email another agent at its own job address (triggers its next run); chains are capped at 5 hops." },
  { service: "mailbox", name: "mailbox_send_result", renamedFrom: "Send result", description: "End the run with one email: the final result (closes the task), or a hand-off to another agent via `to`. Filed in the results folder too. Every pi run is told to do this last." },
  { service: "mailbox", name: "mailbox_list_labels", description: "List the agent mailbox's labels. Final results are labelled RESULT and with the task's name." },
  { service: "mailbox", name: "mailbox_label_mail", description: "Add and/or remove labels on a mail in the agent mailbox by mail id; labels to add are created if missing." },
];

function syncDefaults(): void {
  const db = getDataDb();
  const exists = db.prepare("SELECT 1 FROM tools WHERE service = ? AND name = ?");
  const insert = db.prepare("INSERT INTO tools (id, service, name, description, created_at) VALUES (?, ?, ?, ?, ?)");
  const now = new Date().toISOString();
  for (const tool of DEFAULT_TOOLS) {
    if (tool.renamedFrom) db.prepare("UPDATE tools SET name = ? WHERE service = ? AND name = ?").run(tool.name, tool.service, tool.renamedFrom);
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
