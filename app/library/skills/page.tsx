"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api.ts";
import type { SkillFile } from "../../lib/types.ts";

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<SkillFile[]>("/api/library/skills").then(setSkills).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Skills</h1>
      </div>
      <p className="muted">
        The skills in <code>skills/</code>, edited there. Every agent in every run gets every skill (pi&apos;s <code>--skill</code>) — like the tools.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {skills === null ? (
        <p className="muted">Loading…</p>
      ) : skills.length === 0 ? (
        <div className="empty-state">No skills yet — add a folder (with a SKILL.md) or a .md file to skills/.</div>
      ) : (
        skills.map((s) => (
          <div key={s.name} id={s.name} className="card">
            <h3 style={{ marginTop: 0 }}>
              {s.name} <span className="muted" style={{ fontWeight: "normal" }}>({s.kind})</span>
            </h3>
            <pre className="artifact">{s.content || "(no SKILL.md)"}</pre>
          </div>
        ))
      )}
    </>
  );
}
