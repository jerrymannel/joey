"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../../lib/api.ts";
import type { Run, Task } from "../../../lib/types.ts";
import RunLogPanel from "../../../components/RunLogPanel.tsx";
import YoutubeDownloads from "../../../components/YoutubeDownloads.tsx";
import ConfirmModal from "../../../components/ConfirmModal.tsx";

export default function AutomationViewPage({ params }: { params: Promise<{ service: string; id: string }> }) {
  const { service, id } = usePromise(params);
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function load() {
    api
      .get<Task>(`/api/tasks/${id}`)
      .then(setTask)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    api.get<Run[]>(`/api/tasks/${id}/runs`).then(setRuns).catch(() => setRuns([]));
  }

  useEffect(load, [id]);

  // Poll while a run is in flight so its status/logs update without a manual refresh.
  useEffect(() => {
    const hasActive = (runs ?? []).some((r) => r.status === "pending" || r.status === "running");
    if (!hasActive) return;
    const timer = setInterval(() => api.get<Run[]>(`/api/tasks/${id}/runs`).then(setRuns).catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [runs, id]);

  async function startRun() {
    setStarting(true);
    setError(null);
    try {
      await api.post(`/api/tasks/${id}/runs`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to start run");
    } finally {
      setStarting(false);
    }
  }

  async function confirmDelete() {
    await api.del(`/api/tasks/${id}`);
    router.push(`/automations/${service}`);
  }

  if (!task) {
    return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  }

  const hasActiveRun = (runs ?? []).some((r) => r.status === "pending" || r.status === "running");

  return (
    <>
      <p className="crumb">
        <Link href={`/automations/${service}`}>← {service === "gmail" ? "Gmail" : "YouTube"} automations</Link>
      </p>
      <div className="page-header">
        <h1>{task.name}</h1>
        <span className="row">
          <button type="button" className="secondary" onClick={() => router.push(`/automations/${service}/${id}/edit`)}>
            Edit
          </button>
          <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        </span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="field">
          <label>Schedule</label>
          <p style={{ margin: 0 }}>{task.schedule ?? "Manual only"}</p>
        </div>
        <div className="field">
          <label>{service === "gmail" ? "Gmail" : "YouTube"} account</label>
          <p style={{ margin: 0 }}>{task.account || "(first connected account)"}</p>
        </div>
        {service === "gmail" && (
          <div className="field">
            <label>Gmail search string</label>
            <p style={{ margin: 0 }}>{task.searchQuery || "(none)"}</p>
          </div>
        )}
        {service === "youtube" && (
          <div className="field">
            <label>Playlist</label>
            <p style={{ margin: 0 }}>{task.playlistId || "(none)"}</p>
          </div>
        )}
        <div className="field">
          <label>Output folder</label>
          <p style={{ margin: 0 }}>{task.folderPath}</p>
        </div>
        <button type="button" onClick={startRun} disabled={starting || hasActiveRun}>
          {starting ? "Starting…" : "Start run"}
        </button>
      </div>

      <h2>Logs</h2>
      <RunLogPanel taskId={id} runs={runs} withResults={false} />

      {service === "youtube" && <YoutubeDownloads task={task} />}

      {confirmingDelete && (
        <ConfirmModal
          title="Delete automation?"
          message={`"${task.name}" and its run history will be permanently deleted.`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}
