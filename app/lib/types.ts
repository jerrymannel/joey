export const HARNESSES = ["pi", "claude", "agy", "adk"] as const;
export type Harness = (typeof HARNESSES)[number];

export const TASK_SERVICES = ["generic", "gmail", "youtube"] as const;
export type TaskService = (typeof TASK_SERVICES)[number];

export const THINKING_LEVELS = ["low", "medium", "high"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface GeneralSettings {
  workspaceFolder: string | null;
}

export interface Task {
  id: string;
  name: string;
  folderPath: string;
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
  /** pi-only: reasoning effort passed via --thinking-level. Empty means pi's own default. */
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
  createdAt: string;
}

export interface Prompt {
  id: string;
  name: string;
  content: string;
  createdAt: string;
}

export const TOOL_SERVICES = ["gmail", "youtube"] as const;
export type ToolService = (typeof TOOL_SERVICES)[number];

export interface ToolDef {
  id: string;
  service: ToolService;
  name: string;
  description: string;
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

export interface SimulatedCommand {
  command: string;
  cwd: string;
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

export type DownloadState = "queued" | "metadata" | "video" | "audio" | "subtitles" | "done" | "failed";

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
