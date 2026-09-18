"use client";

import { useState } from "react";
import { api, ApiError } from "../lib/api.ts";
import type { AiModel } from "../lib/types.ts";

/** A short curated list of common hosted models — not exhaustive, just enough to skip typing the value by hand. Anything else goes through "Custom". */
const STANDARD_MODELS = [
  { name: "Claude Sonnet 5", value: "claude-sonnet-5" },
  { name: "Claude Opus 5", value: "claude-opus-5" },
  { name: "Claude Haiku 4.5", value: "claude-haiku-4-5-20251001" },
  { name: "Claude Fable 5.1", value: "claude-fable-5-1" },
] as const;

interface FormState {
  kind: "standard" | "custom";
  name: string;
  value: string;
  endpoint: string;
}

function formFromModel(model?: AiModel): FormState {
  const isStandard = model ? STANDARD_MODELS.some((m) => m.value === model.value) && !model.endpoint : true;
  return {
    kind: model ? (isStandard ? "standard" : "custom") : "standard",
    name: model?.name ?? STANDARD_MODELS[0].name,
    value: model?.value ?? STANDARD_MODELS[0].value,
    endpoint: model?.endpoint ?? "",
  };
}

/** The Create and Edit pages for a model both render this — see AGENTS.md's CRUD pattern. */
export default function ModelForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: AiModel;
  onCancel: () => void;
  onSaved: (model: AiModel) => void;
}) {
  const [form, setForm] = useState<FormState>(formFromModel(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickStandard(value: string) {
    const standard = STANDARD_MODELS.find((m) => m.value === value)!;
    setForm((f) => ({ ...f, value: standard.value, name: standard.name }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        value: form.value,
        endpoint: form.kind === "custom" ? form.endpoint : "",
      };
      const model = initial
        ? await api.patch<AiModel>(`/api/models/${initial.id}`, payload)
        : await api.post<AiModel>("/api/models", payload);
      onSaved(model);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save model");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card form-page">
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label>Source</label>
          <label className="row" style={{ fontWeight: "normal" }}>
            <input
              type="radio"
              style={{ width: "auto" }}
              checked={form.kind === "standard"}
              onChange={() => setForm((f) => ({ ...f, kind: "standard", value: STANDARD_MODELS[0].value, name: STANDARD_MODELS[0].name }))}
            />
            Standard model
          </label>
          <label className="row" style={{ fontWeight: "normal" }}>
            <input
              type="radio"
              style={{ width: "auto" }}
              checked={form.kind === "custom"}
              onChange={() => setForm((f) => ({ ...f, kind: "custom" }))}
            />
            Custom (own endpoint)
          </label>
        </div>

        {form.kind === "standard" ? (
          <div className="field">
            <label>Model</label>
            <select value={form.value} onChange={(e) => pickStandard(e.target.value)}>
              {STANDARD_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Value (passed via --model)</label>
              <input
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder="llama-3-70b"
                required
              />
            </div>
            <div className="field">
              <label>Endpoint (custom API base URL)</label>
              <input
                value={form.endpoint}
                onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))}
                placeholder="http://localhost:8000/v1"
                required
              />
            </div>
          </>
        )}

        <div className="row">
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : initial ? "Save" : "Create"}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
