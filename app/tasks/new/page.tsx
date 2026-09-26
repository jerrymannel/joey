"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../lib/api.ts";
import type { Model, PromptFile, ScriptDef } from "../../lib/types.ts";

const THINKING = ["", "off", "minimal", "low", "medium", "high", "xhigh", "max"];

interface StepForm {
  kind: "script" | "agent";
  script: string;
  params: Record<string, string>;
  // agent step: a model + a prompt (every agent gets all tools, MCP servers and skills)
  prompt: string;
  model: string;
  thinking: string;
  mode: "inline" | "file";
  instruction: string;
  instructionFile: string;
  reviews: string; // 1-based step number, or ""
  maxRounds: string;
  timeout: string;
}

const emptyStep = (kind: "script" | "agent"): StepForm => ({ kind, script: "", params: {}, prompt: "", model: "", thinking: "", mode: "inline", instruction: "", instructionFile: "", reviews: "", maxRounds: "", timeout: "" });

/** name → a valid slug (lowercase letters, digits, dashes). */
const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export default function NewTaskPage() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<string[]>([]);
  const [scripts, setScripts] = useState<ScriptDef[]>([]);
  const [models, setModels] = useState<Model[]>([]);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [schedule, setSchedule] = useState("");
  const [steps, setSteps] = useState<StepForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    api.get<PromptFile[]>("/api/library/prompts").then((p) => setPrompts(p.map((x) => x.name))).catch(() => {});
    api.get<{ scripts: ScriptDef[] }>("/api/library/scripts").then((d) => setScripts(d.scripts)).catch(() => {});
    api.get<{ models: Model[] }>("/api/library/models").then((d) => setModels(d.models)).catch(() => {});
  }, []);

  const setStep = (i: number, patch: Partial<StepForm>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const moveStep = (i: number, d: number) => setSteps((s) => { const n = [...s]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });

  function build() {
    const def: Record<string, unknown> = { name: name || slug };
    if (schedule.trim()) def.schedule = schedule.trim();
    def.steps = steps.map((s) => {
      if (s.kind === "script") {
        const params = Object.fromEntries(Object.entries(s.params).filter(([, v]) => v !== ""));
        return { script: s.script, ...(Object.keys(params).length ? { params } : {}) };
      }
      const step: Record<string, unknown> = { agent: { prompt: s.prompt, model: s.model, ...(s.thinking ? { thinking: s.thinking } : {}) } };
      if (s.mode === "file") step.instructionFile = s.instructionFile;
      else step.instruction = s.instruction;
      if (s.reviews) step.reviews = Number(s.reviews);
      if (s.reviews && s.maxRounds) step.maxRounds = Number(s.maxRounds);
      if (s.timeout.trim()) step.timeout = s.timeout.trim();
      return step;
    });
    return def;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors([]);
    try {
      await api.post<{ slug: string }>("/api/tasks", { slug, definition: build() });
      router.push(`/tasks/${slug}`);
    } catch (err) {
      if (err instanceof ApiError) {
        // A 422 carries the file's validation errors as `error` (joined) — but our api client only surfaces `error`; show it.
        setErrors([err.message]);
      } else {
        setErrors(["failed to save the task"]);
      }
      setSaving(false);
    }
  }

  return (
    <>
      <p className="crumb">
        <Link href="/tasks">← Tasks</Link>
      </p>
      <div className="page-header">
        <h1>New task</h1>
      </div>
      <p className="muted">Build a <code>tasks/&lt;name&gt;.yaml</code> and save it. It&apos;s validated on save; you can hand-edit the file afterwards.</p>

      {errors.length > 0 && (
        <div className="error-banner">
          <strong>Couldn&apos;t save:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{errors.map((e) => <li key={e} style={{ whiteSpace: "pre-wrap" }}>{e}</li>)}</ul>
        </div>
      )}

      <form onSubmit={submit}>
        <div className="card">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => { setName(e.target.value); if (!slugEdited) setSlug(toSlug(e.target.value)); }} placeholder="Inbox digest" required />
          </div>
          <div className="field">
            <label>File name</label>
            <div className="row" style={{ gap: 4 }}>
              <span className="muted">tasks/</span>
              <input value={slug} onChange={(e) => { setSlug(toSlug(e.target.value)); setSlugEdited(true); }} placeholder="inbox-digest" required />
              <span className="muted">.yaml</span>
            </div>
          </div>
          <div className="field">
            <label>Schedule (5-field cron, optional)</label>
            <input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="0 8 * * 1-5" />
          </div>
        </div>

        <div className="page-header">
          <h2>Steps</h2>
          <span className="row">
            <button type="button" className="secondary" onClick={() => setSteps((s) => [...s, emptyStep("script")])}>Add script step</button>
            <button type="button" className="secondary" onClick={() => setSteps((s) => [...s, emptyStep("agent")])}>Add agent step</button>
          </span>
        </div>
        {steps.length === 0 && <p className="muted">Add at least one step.</p>}
        {steps.map((s, i) => {
          const earlierAgents = steps.slice(0, i).map((x, j) => ({ n: j + 1, step: x })).filter((x) => x.step.kind === "agent" && x.step.prompt);
          const scriptDef = scripts.find((x) => x.name === s.script);
          return (
            <div className="card" key={i}>
              <div className="page-header" style={{ marginTop: 0 }}>
                <strong>Step {i + 1} · {s.kind}</strong>
                <span className="row">
                  <button type="button" className="secondary" disabled={i === 0} onClick={() => moveStep(i, -1)}>↑</button>
                  <button type="button" className="secondary" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)}>↓</button>
                  <button type="button" className="danger" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>Remove</button>
                </span>
              </div>

              {s.kind === "script" ? (
                <>
                  <div className="field">
                    <label>Script</label>
                    <select value={s.script} onChange={(e) => setStep(i, { script: e.target.value, params: {} })} required>
                      <option value="">choose a script…</option>
                      {scripts.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                    </select>
                  </div>
                  {scriptDef && Object.entries(scriptDef.params).map(([p, spec]) => (
                    <div className="field" key={p}>
                      <label>{p}{spec.required ? " *" : ""}</label>
                      <input value={s.params[p] ?? ""} onChange={(e) => setStep(i, { params: { ...s.params, [p]: e.target.value } })} placeholder={spec.description} required={spec.required} />
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="field">
                    <label>Prompt (prompts/)</label>
                    <select value={s.prompt} onChange={(e) => setStep(i, { prompt: e.target.value })} required>
                      <option value="">choose a prompt…</option>
                      {prompts.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Model (models.yaml)</label>
                    <select value={s.model} onChange={(e) => setStep(i, { model: e.target.value })} required>
                      <option value="">choose a model…</option>
                      {models.map((m) => <option key={m.name} value={m.name}>{m.endpoint ? `${m.name} (local)` : m.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Thinking</label>
                    <select value={s.thinking} onChange={(e) => setStep(i, { thinking: e.target.value })}>
                      {THINKING.map((t) => <option key={t} value={t}>{t || "default"}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Instruction</label>
                    <div className="row" style={{ marginBottom: 6 }}>
                      <label className="row" style={{ fontWeight: "normal", gap: 4 }}>
                        <input type="radio" style={{ width: "auto" }} checked={s.mode === "inline"} onChange={() => setStep(i, { mode: "inline" })} /> inline
                      </label>
                      <label className="row" style={{ fontWeight: "normal", gap: 4 }}>
                        <input type="radio" style={{ width: "auto" }} checked={s.mode === "file"} onChange={() => setStep(i, { mode: "file" })} /> from prompts/
                      </label>
                    </div>
                    {s.mode === "inline" ? (
                      <textarea rows={3} value={s.instruction} onChange={(e) => setStep(i, { instruction: e.target.value })} placeholder="Summarise the emails above." required />
                    ) : (
                      <select value={s.instructionFile} onChange={(e) => setStep(i, { instructionFile: e.target.value })} required>
                        <option value="">choose a prompt…</option>
                        {prompts.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="field">
                    <label>Reviews (optional)</label>
                    <select value={s.reviews} onChange={(e) => setStep(i, { reviews: e.target.value })}>
                      <option value="">— not a review —</option>
                      {earlierAgents.map((x) => <option key={x.n} value={x.n}>step {x.n} ({x.step.prompt.replace(/\.md$/, "")})</option>)}
                    </select>
                  </div>
                  {s.reviews && (
                    <div className="field">
                      <label>Max rounds</label>
                      <input type="number" min={1} value={s.maxRounds} onChange={(e) => setStep(i, { maxRounds: e.target.value })} placeholder="3" />
                    </div>
                  )}
                  <div className="field">
                    <label>Timeout (optional, e.g. 30m)</label>
                    <input value={s.timeout} onChange={(e) => setStep(i, { timeout: e.target.value })} placeholder="30m" />
                  </div>
                </>
              )}
            </div>
          );
        })}

        <div className="row" style={{ marginTop: 16 }}>
          <button type="submit" disabled={saving || steps.length === 0}>{saving ? "Saving…" : "Save task"}</button>
          <button type="button" className="secondary" onClick={() => router.push("/tasks")}>Cancel</button>
        </div>
      </form>
    </>
  );
}
