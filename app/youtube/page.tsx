"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "../lib/api.ts";
import type {
  DownloadJobStatus,
  PlaylistSummary,
  PlaylistVideo,
  SimulatedYoutubeCommand,
  YoutubeRun,
  YoutubeStatus,
} from "../lib/types.ts";

const ACTIVE_STATES = new Set(["queued", "metadata", "video", "audio", "subtitles"]);

export default function YoutubePage() {
  const [status, setStatus] = useState<YoutubeStatus | null>(null);
  const [videos, setVideos] = useState<PlaylistVideo[] | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceFolder, setWorkspaceFolder] = useState("");
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [jobs, setJobs] = useState<Record<string, DownloadJobStatus>>({});
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [runs, setRuns] = useState<YoutubeRun[] | null>(null);
  const [processingAll, setProcessingAll] = useState(false);
  const [simulation, setSimulation] = useState<SimulatedYoutubeCommand[] | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [activeTab, setActiveTab] = useState<"log" | "videos" | "simulate">("log");

  useEffect(() => {
    api.get<YoutubeStatus>("/api/settings/youtube").then((s) => {
      setStatus(s);
      setWorkspaceFolder(s.workspaceFolder ?? "");
    });
    refreshRuns();
  }, []);

  function refreshRuns() {
    api
      .get<YoutubeRun[]>("/api/youtube/runs")
      .then(setRuns)
      .catch(() => {});
  }

  useEffect(() => {
    if (!status || status.accounts.length === 0) return;
    api
      .get<PlaylistSummary[]>("/api/youtube/playlists")
      .then(setPlaylists)
      .catch((err) => setError(err instanceof ApiError ? err.message : "failed to load playlists"));
  }, [status?.accounts.length]);

  function listVideos() {
    if (videos !== null) {
      setVideos(null);
      return;
    }
    setLoadingVideos(true);
    setError(null);
    api
      .get<PlaylistVideo[]>("/api/youtube/videos")
      .then(setVideos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "failed to load playlist"))
      .finally(() => setLoadingVideos(false));
  }

  useEffect(() => {
    setVideos(null);
  }, [status?.playlistId]);

  async function saveWorkspaceFolder() {
    setSavingWorkspace(true);
    setError(null);
    try {
      const updated = await api.put<YoutubeStatus>("/api/settings/youtube", { workspaceFolder });
      setStatus(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save workspace folder");
    } finally {
      setSavingWorkspace(false);
    }
  }

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
          .then((job) => {
            setJobs((prev) => ({ ...prev, [videoId]: job }));
            if (!ACTIVE_STATES.has(job.state)) refreshRuns();
          })
          .catch(() => {});
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [jobs]);

  async function process(videoId: string, title: string) {
    if (!workspaceFolder) {
      setError("Set a workspace folder first");
      return;
    }
    setError(null);
    try {
      const job = await api.post<DownloadJobStatus>("/api/youtube/process", { videoId, title, workspaceFolder });
      setJobs((prev) => ({ ...prev, [videoId]: job }));
      refreshRuns();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to start download");
    }
  }

  async function processAll() {
    if (!workspaceFolder) {
      setError("Set a workspace folder first");
      return;
    }
    if (!status?.playlistId) {
      setError("Select a playlist first");
      return;
    }
    setProcessingAll(true);
    try {
      const list = videos ?? (await api.get<PlaylistVideo[]>("/api/youtube/videos"));
      if (videos === null) setVideos(list);
      for (const v of list) {
        await process(v.videoId, v.title);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to load playlist");
    } finally {
      setProcessingAll(false);
    }
  }

  async function simulate() {
    if (simulation) {
      setSimulation(null);
      return;
    }
    if (!workspaceFolder) {
      setError("Set a workspace folder first");
      return;
    }
    setSimulating(true);
    setError(null);
    try {
      setSimulation(
        await api.get<SimulatedYoutubeCommand[]>(
          `/api/youtube/simulate?workspaceFolder=${encodeURIComponent(workspaceFolder)}`,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to simulate");
    } finally {
      setSimulating(false);
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

      <div className="split-layout">
        <div>
          <div className="card">
            <div className="field">
              <label htmlFor="workspace">Workspace folder</label>
              <textarea
                id="workspace"
                value={workspaceFolder}
                onChange={(e) => setWorkspaceFolder(e.target.value)}
                placeholder="/path/to/folder"
                rows={2}
                style={{ minHeight: "auto", resize: "none", wordBreak: "break-all", fontFamily: "inherit" }}
              />
              <button
                type="button"
                disabled={savingWorkspace || workspaceFolder === (status?.workspaceFolder ?? "")}
                onClick={saveWorkspaceFolder}
              >
                {savingWorkspace ? "Saving…" : "Save"}
              </button>
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
          </div>
        </div>

        <div>
          <div className="tabs">
            <button
              type="button"
              className={`tab ${activeTab === "log" ? "active" : ""}`}
              onClick={() => setActiveTab("log")}
            >
              Run log
            </button>
            <button
              type="button"
              className={`tab ${activeTab === "videos" ? "active" : ""}`}
              onClick={() => setActiveTab("videos")}
            >
              Videos
            </button>
            <button
              type="button"
              className={`tab ${activeTab === "simulate" ? "active" : ""}`}
              onClick={() => setActiveTab("simulate")}
            >
              Simulate
            </button>
          </div>

          {activeTab === "videos" && (
            <div className="card">
              <button type="button" disabled={!status?.playlistId || loadingVideos} onClick={listVideos}>
                {loadingVideos ? "Loading…" : videos !== null ? "Hide videos" : "List videos"}
              </button>

              {videos !== null && (
                <>
                  <p className="muted">
                    {videos.length} video{videos.length === 1 ? "" : "s"}
                  </p>
                  {videos.length > 0 && (
                    <div className="scroll-card">
                      <table>
                        <thead>
                          <tr>
                            <th>Video</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {videos.map((v) => {
                            const job = jobs[v.videoId];
                            return (
                              <tr key={v.videoId}>
                                <td>{v.title}</td>
                                <td className="muted" title={job?.error}>
                                  {job ? job.state : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "simulate" && (
            <div className="card">
              <button
                type="button"
                disabled={!status?.playlistId || !workspaceFolder || simulating}
                onClick={simulate}
              >
                {simulating ? "Simulating…" : simulation ? "Hide Simulation" : "Simulate"}
              </button>

              {simulation && (
                <div className="field scroll-card">
                  <label>Commands each video would run (preview only, nothing is run)</label>
                  {simulation.map((s) => (
                    <pre key={s.videoId} className="artifact">
                      {s.title}
                      {"\n"}cwd: {s.cwd}
                      {"\n"}
                      {s.commands.join("\n")}
                    </pre>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "log" && (
            <>
              <div className="card">
                <button type="button" disabled={!status?.playlistId || processingAll} onClick={processAll}>
                  {processingAll ? "Processing…" : "Process"}
                </button>
              </div>

              {!runs ? (
                <p className="muted">Loading…</p>
              ) : runs.length === 0 ? (
                <div className="empty-state">No runs yet.</div>
              ) : (
                <div className="card">
                  <table>
                    <thead>
                      <tr>
                        <th>Video</th>
                        <th>Status</th>
                        <th>Artifacts</th>
                        <th>Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => (
                        <tr key={r.id}>
                          <td>{r.title}</td>
                          <td className="muted" title={r.errorMessage ?? undefined}>
                            {r.status}
                          </td>
                          <td className="muted">{r.artifactDir}</td>
                          <td className="muted">{new Date(r.startedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
