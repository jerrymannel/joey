"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "../lib/api.ts";
import type { DownloadJobStatus, PlaylistSummary, PlaylistVideo, YoutubeStatus } from "../lib/types.ts";

const WORKSPACE_KEY = "youtube_workspace_folder";
const ACTIVE_STATES = new Set(["queued", "video", "audio", "subtitles"]);

export default function YoutubePage() {
  const [status, setStatus] = useState<YoutubeStatus | null>(null);
  const [videos, setVideos] = useState<PlaylistVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workspaceFolder, setWorkspaceFolder] = useState("");
  const [jobs, setJobs] = useState<Record<string, DownloadJobStatus>>({});
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [savingPlaylist, setSavingPlaylist] = useState(false);

  useEffect(() => {
    setWorkspaceFolder(localStorage.getItem(WORKSPACE_KEY) ?? "");
    api.get<YoutubeStatus>("/api/settings/youtube").then(setStatus);
  }, []);

  useEffect(() => {
    if (!status || status.accounts.length === 0) return;
    api
      .get<PlaylistSummary[]>("/api/youtube/playlists")
      .then(setPlaylists)
      .catch((err) => setError(err instanceof ApiError ? err.message : "failed to load playlists"));
  }, [status?.accounts.length]);

  useEffect(() => {
    if (!status?.playlistId) return;
    setVideos(null);
    api
      .get<PlaylistVideo[]>("/api/youtube/videos")
      .then(setVideos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "failed to load playlist"));
  }, [status?.playlistId]);

  useEffect(() => {
    localStorage.setItem(WORKSPACE_KEY, workspaceFolder);
  }, [workspaceFolder]);

  async function selectPlaylist(playlistId: string) {
    setSavingPlaylist(true);
    setError(null);
    try {
      const updated = await api.put<YoutubeStatus>("/api/settings/youtube", { playlistId });
      setStatus(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save playlist selection");
    } finally {
      setSavingPlaylist(false);
    }
  }

  useEffect(() => {
    const activeIds = Object.values(jobs)
      .filter((j) => ACTIVE_STATES.has(j.state))
      .map((j) => j.videoId);
    if (activeIds.length === 0) return;
    const timer = setInterval(() => {
      for (const videoId of activeIds) {
        api
          .get<DownloadJobStatus>(`/api/youtube/process/${videoId}`)
          .then((job) => setJobs((prev) => ({ ...prev, [videoId]: job })))
          .catch(() => {});
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [jobs]);

  async function process(videoId: string) {
    if (!workspaceFolder) {
      setError("Set a workspace folder first");
      return;
    }
    setError(null);
    try {
      const job = await api.post<DownloadJobStatus>("/api/youtube/process", { videoId, workspaceFolder });
      setJobs((prev) => ({ ...prev, [videoId]: job }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to start download");
    }
  }

  if (status && !status.configured) {
    return (
      <>
        <div className="page-header">
          <h1>YouTube</h1>
        </div>
        <p className="muted">
          Nothing configured? Set up YouTube in <Link href="/integrations">Integrations</Link>.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>YouTube</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="field">
          <label htmlFor="workspace">Workspace folder</label>
          <input
            id="workspace"
            value={workspaceFolder}
            onChange={(e) => setWorkspaceFolder(e.target.value)}
            placeholder="/path/to/folder"
          />
        </div>

        <div className="field">
          <label htmlFor="playlistId">Playlist</label>
          <select
            id="playlistId"
            value={status?.playlistId ?? ""}
            disabled={savingPlaylist || playlists === null}
            onChange={(e) => selectPlaylist(e.target.value)}
          >
            <option value="">Select a playlist…</option>
            {status?.playlistId && !playlists?.some((p) => p.id === status.playlistId) && (
              <option value={status.playlistId}>{status.playlistId} (saved)</option>
            )}
            {playlists?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <p className="muted">
          {playlists !== null
            ? 'Only your own playlists are listed — Google blocks API access to the built-in "Watch Later" playlist.'
            : error
              ? "Couldn't load playlists — see the error above."
              : status && status.accounts.length > 0
                ? "Loading playlists…"
                : "Connect an account in Integrations to list your playlists."}
        </p>
      </div>

      {!status?.playlistId ? (
        <p className="muted">Select a playlist above to load its videos.</p>
      ) : videos === null ? (
        error ? null : <p className="muted">Loading…</p>
      ) : videos.length === 0 ? (
        <div className="empty-state">No videos in the playlist.</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Video</th>
                <th>Channel</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => {
                const job = jobs[v.videoId];
                const active = job && ACTIVE_STATES.has(job.state);
                return (
                  <tr key={v.videoId}>
                    <td>{v.title}</td>
                    <td className="muted">{v.channelTitle}</td>
                    <td className="muted" title={job?.error}>
                      {job ? job.state : "—"}
                    </td>
                    <td>
                      <button type="button" disabled={active} onClick={() => process(v.videoId)}>
                        {active ? "Processing…" : "Process"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
