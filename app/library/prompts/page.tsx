"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api.ts";
import type { PromptFile } from "../../lib/types.ts";

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PromptFile[]>("/api/library/prompts").then(setPrompts).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  // Task pages link here as #<file name>; the list only exists once loaded, so scroll once it has.
  useEffect(() => {
    if (prompts && location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }, [prompts]);

  return (
    <>
      <div className="page-header">
        <h1>Prompts</h1>
      </div>
      <p className="muted">
        The files in <code>prompts/</code>, edited there. An agent names one as its <code>prompt:</code>; it&apos;s sent as the agent&apos;s briefing the first time the agent is used in a run.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {prompts === null ? (
        <p className="muted">Loading…</p>
      ) : prompts.length === 0 ? (
        <div className="empty-state">No prompt files yet — add a .md file to prompts/.</div>
      ) : (
        prompts.map((p) => (
          <div key={p.name} id={p.name} className="card">
            <h3 style={{ marginTop: 0 }}>{p.name}</h3>
            <pre className="artifact">{p.content}</pre>
          </div>
        ))
      )}
    </>
  );
}
