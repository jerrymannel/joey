"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../../lib/api.ts";
import type { AiModel, Run, Task, ToolDef } from "../../../lib/types.ts";
import RunLogPanel from "../../../components/RunLogPanel.tsx";
import YoutubeDownloads from "../../../components/YoutubeDownloads.tsx";
import ConfirmModal from "../../../components/ConfirmModal.tsx";

export default function AutomationViewPage({ params }: { params: Promise<{ service: string; id: string }> }) {
  const { service, id } = usePromise(params);
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [models, setModels] = useState<AiModel[]>([]);
  const [tools, setTools] = useState<ToolDef[]>([]);
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
  useEffect(() => {
    api.get<AiModel[]>("/api/models").then(setModels).catch(() => {});
    api.get<ToolDef[]>(`/api/tools?service=${service}`).then(setTools).catch(() => {});
  }, [service]);

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

  const modelName = models.find((m) => m.value === task.model)?.name ?? (task.model || "Default");
  const toolNames = tools.filter((t) => task.toolIds.includes(t.id)).map((t) => t.name);
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
          <label>Instruction</label>
          <pre className="artifact">{task.prompt || "(none)"}</pre>
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
          <label>Workspace folder</label>
          <p style={{ margin: 0 }}>{task.folderPath}</p>
        </div>
        <div className="field">
          <label>Model</label>
          <p style={{ margin: 0 }}>{modelName}</p>
        </div>
        <div className="field">
          <label>Thinking level (pi)</label>
          <p style={{ margin: 0 }}>{task.thinkingLevel || "Default"}</p>
        </div>
        <div className="field">
          <label>Trust folder</label>
          <p style={{ margin: 0 }}>{task.trustFolder ? "Yes — pi skips permission prompts" : "No"}</p>
        </div>
        {toolNames.length > 0 && (
          <div className="field">
            <label>Tools</label>
            <p style={{ margin: 0 }}>{toolNames.join(", ")}</p>
          </div>
        )}
        <button type="button" onClick={startRun} disabled={starting || hasActiveRun}>
          {starting ? "Starting…" : "Start run"}
        </button>
      </div>

      <h2>Logs</h2>
      <RunLogPanel taskId={id} runs={runs} />

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
