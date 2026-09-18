"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../../lib/api.ts";
import { HARNESSES, THINKING_LEVELS, type Harness, type Task } from "../../../lib/types.ts";

export default function EditTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = usePromise(params);
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [folderPath, setFolderPath] = useState("");
  const [prompt, setPrompt] = useState("");
  const [harness, setHarness] = useState<Harness>("pi");
  const [cliParams, setCliParams] = useState("");
  const [model, setModel] = useState("");
  const [schedule, setSchedule] = useState("");
  const [thinkingLevel, setThinkingLevel] = useState("");
  const [trustFolder, setTrustFolder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Task>(`/api/tasks/${taskId}`)
      .then((t) => {
        setTask(t);
        setFolderPath(t.folderPath);
        setPrompt(t.prompt);
        setHarness(t.harness);
        setCliParams(t.cliParams);
        setModel(t.model);
        setSchedule(t.schedule ?? "");
        setThinkingLevel(t.thinkingLevel);
        setTrustFolder(t.trustFolder);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [taskId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch<Task>(`/api/tasks/${taskId}`, {
        folderPath,
        prompt,
        harness,
        cliParams,
        model,
        schedule: schedule || null,
        thinkingLevel,
        trustFolder,
      });
      router.push(`/tasks/${taskId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save task");
    } finally {
      setSaving(false);
    }
  }

  if (!task) {
    return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  }

  return (
    <>
      <p className="crumb">
        <Link href={`/tasks/${taskId}`}>← {task.name}</Link>
      </p>
      <div className="page-header">
        <h1>Edit task</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card form-page">
        <form onSubmit={submit}>
          <div className="field">
            <label>Folder path (absolute)</label>
            <input value={folderPath} onChange={(e) => setFolderPath(e.target.value)} required />
          </div>
          <div className="field">
            <label>Prompt / instructions</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe what the agent should do…" />
          </div>
          <div className="field">
            <label>Harness</label>
            <select value={harness} onChange={(e) => setHarness(e.target.value as Harness)}>
              {HARNESSES.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            {harness === "adk" && <p className="muted">"adk" isn't wired up to run yet.</p>}
          </div>
          <div className="field">
            <label>CLI params (extra flags passed to the harness, if needed)</label>
            <input value={cliParams} onChange={(e) => setCliParams(e.target.value)} placeholder="--no-tools" />
          </div>
          <div className="field">
            <label>Model (forced via --model / env var)</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-5" />
          </div>
          {harness === "pi" && (
            <>
              <div className="field">
                <label>Thinking level</label>
                <select value={thinkingLevel} onChange={(e) => setThinkingLevel(e.target.value)}>
                  <option value="">Default</option>
                  {THINKING_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="row" style={{ fontWeight: "normal" }}>
                  <input
                    type="checkbox"
                    style={{ width: "auto" }}
                    checked={trustFolder}
                    onChange={(e) => setTrustFolder(e.target.checked)}
                  />
                  Trust this folder (pi runs without permission prompts)
                </label>
              </div>
            </>
          )}
          <div className="field">
            <label>Schedule (5-field cron, blank = manual only)</label>
            <input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="0 * * * *" />
          </div>
          <div className="row">
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="secondary" onClick={() => router.push(`/tasks/${taskId}`)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
