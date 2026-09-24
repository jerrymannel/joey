export const HARNESSES = ["pi", "claude", "agy", "adk"] as const;
export type Harness = (typeof HARNESSES)[number];

export const TASK_SERVICES = ["generic", "gmail", "youtube", "transcription"] as const;
export type TaskService = (typeof TASK_SERVICES)[number];

/** How an automation service is named in the UI. */
export const AUTOMATION_LABELS: Record<string, string> = { gmail: "Gmail", youtube: "YouTube", transcription: "Transcription" };

export const THINKING_LEVELS = ["low", "medium", "high"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface GeneralSettings {
  workspaceFolder: string | null;
  /** Where run results are written; `<cwd>/results` until one is saved. */
  resultsFolder: string;
  /** The connected Gmail account used as the agents' shared inbox; null until one is connected. */
  mailAccount: string | null;
  /** The user's own address, where run results are emailed; empty until set. */
  userEmail: string;
}

export interface Task {
  id: string;
  name: string;
  folderPath: string;
  /** The Configurations → Prompts row this task's prompt comes from. */
  promptId: string;
  /** The effective prompt text (the chosen prompt's content) — read-only. */
  prompt: string;
  harness: Harness;
  cliParams: string;
  model: string;
  schedule: string | null;
  service: TaskService;
  toolIds: string[];
  /** Gmail automations run against mail matching this Gmail search query; unused by other services. */
  searchQuery: string;
  /** The YouTube playlist a youtube automation downloads from; unused by other services. */
  playlistId: string;
  /** The file extensions a transcription automation transcribes, comma-separated without dots (`mp3,wav`); unused by other services. */
  extensions: string;
  /** A youtube automation transcribes each video's audio once it has downloaded; unused by other services. */
  transcribe: boolean;
  /** The connected Google account (email) a gmail/youtube automation runs as; empty = the first connected one. */
  account: string;
  /** pi-only: reasoning effort passed via --thinking. Empty means pi's own default. */
  thinkingLevel: string;
  /** pi-only: whether to pass the flag that trusts/auto-approves this task's folder instead of prompting. */
  trustFolder: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiModel {
  id: string;
  name: string;
  value: string;
  /** Custom API base URL for this model, if it's not one of the standard hosted ones. */
  endpoint: string;
  enabled: boolean;
  /** Seeded default — can be disabled, but not edited or deleted. */
  isDefault: boolean;
  createdAt: string;
}

export interface Prompt {
  id: string;
  name: string;
  content: string;
  createdAt: string;
}

export type SshAuthMethod = "password" | "identity";

/** A remote server for the ssh tools; the stored password / key never comes back from the API. */
export interface SshConfig {
  id: string;
  name: string;
  host: string;
  username: string;
  authMethod: SshAuthMethod;
  createdAt: string;
}

export const TOOL_SERVICES = ["gmail", "youtube", "mailbox", "ssh", "whisper"] as const;
export type ToolService = (typeof TOOL_SERVICES)[number];

export interface ToolDef {
  id: string;
  service: ToolService;
  name: string;
  description: string;
  /** Granted to every task without being picked (the mailbox tools). */
  alwaysOn: boolean;
  createdAt: string;
}

export type RunStatus = "pending" | "running" | "completed" | "failed" | "interrupted";

export interface Run {
  id: string;
  taskId: string;
  status: RunStatus;
  output: string;
  errorMessage: string | null;
  startedAt: string;
  endedAt: string | null;
}

/** The full sequence of commands a real run would go through (the herdr tab create/run/close every harness goes through) — see harness.ts's describeRun. */
export interface SimulatedCommand {
  cwd: string;
  commands: string[];
}

export interface GmailAccountStatus {
  email: string;
}

export interface GmailStatus {
  configured: boolean;
  clientId: string | null;
  accounts: GmailAccountStatus[];
}

export interface EmailSummary {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  unread: boolean;
}

export interface EmailDetail extends EmailSummary {
  body: string;
}

export interface YoutubeAccountStatus {
  email: string;
}

export interface YoutubeStatus {
  configured: boolean;
  usesGmailApp: boolean;
  clientId: string | null;
  accounts: YoutubeAccountStatus[];
}

export interface PlaylistVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
}

export type DownloadState = "queued" | "metadata" | "video" | "audio" | "subtitles" | "transcribing" | "done" | "failed";

export interface DownloadJobStatus {
  videoId: string;
  state: DownloadState;
  error?: string;
}

export interface PlaylistSummary {
  id: string;
  title: string;
}

export interface SimulatedYoutubeCommand {
  videoId: string;
  title: string;
  cwd: string;
  commands: string[];
}

export interface YoutubeRun {
  id: string;
  videoId: string;
  title: string;
  artifactDir: string;
  status: DownloadState;
  errorMessage: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface TokenInfo {
  scopes: string[];
  expiresIn: number;
}

/** A run's final output — a file in the results folder. */
export interface ResultMessage {
  file: string;
  id: string;
  /** `Job name (job id)`. */
  from: string;
  fromId: string;
  fromLabel: string;
  /** The run this result reports on. */
  run: string;
  /** The agent (job id) the run handed off to instead of closing; empty for a closing result. */
  to: string;
  toLabel: string;
  subject: string;
  body: string;
  /** ISO time parsed from the filename; null for hand-named files that don't follow the pattern. */
  sentAt: string | null;
}

/** An email in the agent inbox. */
export interface MailMessage {
  id: string;
  threadId: string;
  /** The sending agent's job id; empty for a human's / outside mail. */
  fromId: string;
  /** `Job name (job id)` for an agent, otherwise the From header. */
  fromLabel: string;
  /** The job id the mail is addressed to; empty when it isn't addressed to a job. */
  jobId: string;
  subject: string;
  sentAt: string;
  body: string;
  /** Unread = still waiting for the recipient job's next run. */
  unread: boolean;
  /** The run that sent this mail; empty for a human's. */
  run: string;
  hops: number;
}
