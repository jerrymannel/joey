/** Which area a tool belongs to; its name starts with it (`gmail_`, `task_`, …). */
export const TOOL_SERVICES = ["gmail", "youtube", "ssh", "whisper", "task"] as const;
export type ToolService = (typeof TOOL_SERVICES)[number];

/** One of Joey's own pi tools (pi-tools/<name>.ts) — what an agent can list under `tools:` in its task file. */
export interface ToolDef {
  service: ToolService;
  name: string;
  description: string;
  /** Given to every agent without being listed (the task_* tools). */
  alwaysOn: boolean;
}

/** The catalog, in code: every file in pi-tools/ (bar the helpers) has an entry here, and index.ts registers it. */
const TOOLS: Omit<ToolDef, "alwaysOn">[] = [
  { service: "gmail", name: "gmail_search_emails", description: "Search the connected Gmail account with a Gmail search query." },
  { service: "gmail", name: "gmail_read_email", description: "Read the full subject/body/headers of a specific email." },
  { service: "gmail", name: "gmail_list_labels", description: "List the connected Gmail account's labels." },
  { service: "gmail", name: "gmail_create_label", description: "Create a Gmail label (a no-op if it already exists)." },
  { service: "gmail", name: "gmail_delete_label", description: "Delete one of the user's own Gmail labels by name; emails keep existing." },
  { service: "gmail", name: "gmail_label_email", description: "Add and/or remove labels on an email by id; labels to add are created if missing." },
  { service: "youtube", name: "youtube_list_playlists", description: "List the connected account's own playlists." },
  { service: "youtube", name: "youtube_show_playlist_contents", description: "List the videos inside a given playlist." },
  { service: "youtube", name: "youtube_download_video", description: "Download one YouTube video's mp4, audio and subtitles (and optionally a whisper transcript) into a folder." },
  { service: "ssh", name: "ssh_list_servers", description: "List the SSH configurations (Settings → SSH) the agent can run commands on." },
  { service: "ssh", name: "ssh_run_command", description: "Run one shell command on a configured SSH server and return its output and exit code." },
  { service: "whisper", name: "whisper_transcribe_audio", description: "Transcribe a local audio file to text with OpenAI Whisper; the transcript is also saved next to the audio file." },
  { service: "whisper", name: "whisper_transcribe_folder", description: "Transcribe every audio file under a folder that has no transcript yet with OpenAI Whisper, one .txt saved next to each." },
  { service: "task", name: "task_send_result", description: "Save a task run's final result and email it to the user. Given to every agent." },
  { service: "task", name: "task_review_verdict", description: "Finish a review step: approve the reviewed work or send it back with feedback. Given to every agent." },
];

export function listTools(service?: ToolService): ToolDef[] {
  return TOOLS.filter((t) => !service || t.service === service).map((t) => ({ ...t, alwaysOn: t.service === "task" }));
}
