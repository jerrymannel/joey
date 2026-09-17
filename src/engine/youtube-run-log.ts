import { randomUUID } from "node:crypto";
import { getLogsDb } from "./db.ts";
import type { DownloadState } from "./youtube-download.ts";

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

interface YoutubeRunRow {
  id: string;
  video_id: string;
  title: string;
  artifact_dir: string;
  status: string;
  error_message: string | null;
  started_at: string;
  ended_at: string | null;
}

function runFromRow(row: YoutubeRunRow): YoutubeRun {
  return {
    id: row.id,
    videoId: row.video_id,
    title: row.title,
    artifactDir: row.artifact_dir,
    status: row.status as DownloadState,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export function createYoutubeRun(videoId: string, title: string, artifactDir: string): YoutubeRun {
  const id = randomUUID();
  const now = new Date().toISOString();
  getLogsDb()
    .prepare(
      `INSERT INTO youtube_runs (id, video_id, title, artifact_dir, status, error_message, started_at, ended_at) VALUES (?, ?, ?, ?, 'queued', NULL, ?, NULL)`,
    )
    .run(id, videoId, title, artifactDir, now);
  return getYoutubeRun(id)!;
}

export function getYoutubeRun(id: string): YoutubeRun | undefined {
  const row = getLogsDb().prepare("SELECT * FROM youtube_runs WHERE id = ?").get(id) as YoutubeRunRow | undefined;
  return row ? runFromRow(row) : undefined;
}

export function listYoutubeRuns(limit = 50): YoutubeRun[] {
  const rows = getLogsDb()
    .prepare("SELECT * FROM youtube_runs ORDER BY started_at DESC LIMIT ?")
    .all(limit) as YoutubeRunRow[];
  return rows.map(runFromRow);
}

export function updateYoutubeRunStatus(id: string, status: DownloadState, opts?: { errorMessage?: string }): void {
  const ended = status === "done" || status === "failed";
  getLogsDb()
    .prepare(
      `UPDATE youtube_runs SET status = ?, error_message = COALESCE(?, error_message), ended_at = CASE WHEN ? THEN ? ELSE ended_at END WHERE id = ?`,
    )
    .run(status, opts?.errorMessage ?? null, ended ? 1 : 0, new Date().toISOString(), id);
}
