export const HARNESSES = ["pi", "claude", "agy", "adk"] as const;
export type Harness = (typeof HARNESSES)[number];

export interface Task {
  id: string;
  name: string;
  folderPath: string;
  prompt: string;
  harness: Harness;
  cliParams: string;
  model: string;
  schedule: string | null;
  createdAt: string;
  updatedAt: string;
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
  playlistId: string | null;
  workspaceFolder: string | null;
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
