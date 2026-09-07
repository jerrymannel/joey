"use client";

import { useState } from "react";
import { api, ApiError } from "../lib/api.ts";
import type { AgentRole, ArtifactSchema } from "../lib/types.ts";

type SchemaField = { name: string; type: "string" | "number" | "boolean"; required: boolean };

function schemaToFields(schema: ArtifactSchema | null): SchemaField[] {
  if (!schema) return [];
  return Object.entries(schema.fields).map(([name, type]) => ({
    name,
    type,
    required: schema.required.includes(name),
  }));
}

function fieldsToSchema(fields: SchemaField[]): ArtifactSchema | null {
  const named = fields.filter((f) => f.name.trim());
  if (named.length === 0) return null;
  return {
    fields: Object.fromEntries(named.map((f) => [f.name.trim(), f.type])),
    required: named.filter((f) => f.required).map((f) => f.name.trim()),
  };
}

function listToText(list: string[] | null): string {
  return list?.join(", ") ?? "";
}
function textToList(text: string): string[] | null {
  const items = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

export function RoleEditor({
  taskId,
  role,
  onSaved,
  onDeleted,
  onCancel,
}: {
  taskId: string;
  role: AgentRole | null;
  onSaved: (role: AgentRole) => void;
  onDeleted?: (roleId: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [isReviewer, setIsReviewer] = useState(role?.isReviewer ?? false);
  const [systemPrompt, setSystemPrompt] = useState(role?.systemPrompt ?? "");
  const [provider, setProvider] = useState(role?.provider ?? "anthropic");
  const [model, setModel] = useState(role?.model ?? "claude-sonnet-5");
  const [toolsAllowlist, setToolsAllowlist] = useState(listToText(role?.toolsAllowlist ?? null));
  const [toolsDenylist, setToolsDenylist] = useState(listToText(role?.toolsDenylist ?? null));
  const [artifactPath, setArtifactPath] = useState(role?.artifactPath ?? "artifacts/report.md");
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>(schemaToFields(role?.artifactSchema ?? null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(index: number, patch: Partial<SchemaField>) {
    setSchemaFields((fields) => fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const body = {
      name,
      isReviewer,
      systemPrompt,
      provider,
      model,
      toolsAllowlist: textToList(toolsAllowlist),
      toolsDenylist: textToList(toolsDenylist),
      artifactPath,
      artifactSchema: fieldsToSchema(schemaFields),
    };
    try {
      const saved = role
        ? await api.patch<AgentRole>(`/api/tasks/${taskId}/roles/${role.id}`, body)
        : await api.post<AgentRole>(`/api/tasks/${taskId}/roles`, body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save role");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!role) return;
    if (!confirm(`Delete role "${role.name}"?`)) return;
    await api.del(`/api/tasks/${taskId}/roles/${role.id}`);
    onDeleted?.(role.id);
  }

  return (
    <div className="card">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="implementer" />
      </div>
      <div className="field">
        <label>
          <input type="checkbox" checked={isReviewer} onChange={(e) => setIsReviewer(e.target.checked)} /> Reviewer
          role
        </label>
      </div>
      <div className="field">
        <label>System prompt</label>
        <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Provider</label>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Model</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Tools allowlist (comma-separated, blank = Pi defaults)</label>
          <input value={toolsAllowlist} onChange={(e) => setToolsAllowlist(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Tools denylist (comma-separated)</label>
          <input value={toolsDenylist} onChange={(e) => setToolsDenylist(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Artifact path (relative to worktree)</label>
        <input value={artifactPath} onChange={(e) => setArtifactPath(e.target.value)} />
      </div>

      <div className="field">
        <label>Artifact schema fields (leave empty for freeform Markdown)</label>
        {schemaFields.map((field, i) => (
          <div className="row" key={i} style={{ marginBottom: 6 }}>
            <input
              value={field.name}
              onChange={(e) => updateField(i, { name: e.target.value })}
              placeholder="field name"
              style={{ flex: 2 }}
            />
            <select value={field.type} onChange={(e) => updateField(i, { type: e.target.value as SchemaField["type"] })}>
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
            </select>
            <label style={{ fontSize: 12, whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => updateField(i, { required: e.target.checked })}
              />{" "}
              required
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() => setSchemaFields((fields) => fields.filter((_, idx) => idx !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => setSchemaFields((fields) => [...fields, { name: "", type: "string", required: false }])}
        >
          + Add field
        </button>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={save} disabled={saving || !name || !systemPrompt}>
          {saving ? "Saving…" : "Save Role"}
        </button>
        {role && (
          <button className="danger" onClick={remove} type="button">
            Delete
          </button>
        )}
        {onCancel && (
          <button className="secondary" onClick={onCancel} type="button">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
