"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "../lib/api.ts";
import type {
  DownloadJobStatus,
  PlaylistVideo,
  SimulatedYoutubeCommand,
  Task,
  YoutubeRun,
} from "../lib/types.ts";

const ACTIVE_STATES = new Set(["queued", "metadata", "video", "audio", "subtitles"]);

/** The View page's youtube-only "Downloads" section — lists this automation's playlist, runs its yt-dlp jobs, and previews the commands, all scoped to this task's own workspace folder. */
export default function YoutubeDownloads({ task }: { task: Task }) {
  const [videos, setVideos] = useState<PlaylistVideo[] | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Record<string, DownloadJobStatus>>({});
  const [runs, setRuns] = useState<YoutubeRun[] | null>(null);
  const [processingAll, setProcessingAll] = useState(false);
  const [simulation, setSimulation] = useState<SimulatedYoutubeCommand[] | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [activeTab, setActiveTab] = useState<"log" | "videos" | "simulate">("log");

  function refreshRuns() {
    api
      .get<YoutubeRun[]>(`/api/youtube/runs?folderPath=${encodeURIComponent(task.folderPath)}`)
      .then(setRuns)
      .catch(() => {});
  }

  useEffect(refreshRuns, [task.folderPath]);

  function listVideos() {
    setLoadingVideos(true);
    setError(null);
    api
      .get<PlaylistVideo[]>(`/api/youtube/videos?playlistId=${encodeURIComponent(task.playlistId)}`)
      .then(setVideos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "failed to load playlist"))
      .finally(() => setLoadingVideos(false));
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
    setError(null);
    try {
      const job = await api.post<DownloadJobStatus>("/api/youtube/process", {
        videoId,
        title,
        workspaceFolder: task.folderPath,
      });
      setJobs((prev) => ({ ...prev, [videoId]: job }));
      refreshRuns();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to start download");
    }
  }

  async function processAll() {
    setProcessingAll(true);
    try {
      const list = videos ?? (await api.get<PlaylistVideo[]>(`/api/youtube/videos?playlistId=${encodeURIComponent(task.playlistId)}`));
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
    setSimulating(true);
    setError(null);
    try {
      setSimulation(
        await api.get<SimulatedYoutubeCommand[]>(
          `/api/youtube/simulate?playlistId=${encodeURIComponent(task.playlistId)}&workspaceFolder=${encodeURIComponent(task.folderPath)}`,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to simulate");
    } finally {
      setSimulating(false);
    }
  }

  if (!task.playlistId) {
    return (
      <>
        <h2>Downloads</h2>
        <p className="muted">
          No playlist set — <Link href={`/automations/youtube/${task.id}/edit`}>edit this automation</Link> to pick
          one.
        </p>
      </>
    );
  }

  return (
    <>
      <h2>Downloads</h2>
      {error && <div className="error-banner">{error}</div>}

      <div className="tabs">
        <button type="button" className={`tab ${activeTab === "log" ? "active" : ""}`} onClick={() => setActiveTab("log")}>
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
          <button type="button" disabled={loadingVideos} onClick={listVideos}>
            {loadingVideos ? "Loading…" : "Refresh list"}
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
          <button type="button" disabled={simulating} onClick={simulate}>
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
            <button type="button" disabled={processingAll} onClick={processAll}>
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
    </>
  );
}
