"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import type { AttachInfo } from "../lib/types.ts";

export function BlockedBanner({ workerId }: { workerId: string }) {
  const [info, setInfo] = useState<AttachInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AttachInfo>(`/api/workers/${workerId}/attach-info`)
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [workerId]);

  return (
    <div className="card" style={{ borderColor: "var(--warn)" }}>
      <p>
        <strong style={{ color: "var(--warn)" }}>Blocked</strong> — this agent is waiting on a confirmation
        prompt it can't answer itself. Run the command below in your own terminal to attach and resolve it.
      </p>
      {error && <p className="muted">{error}</p>}
      {info && (
        <>
          <code className="copy">{info.attachCommand}</code>
          <p className="muted" style={{ marginTop: 8, marginBottom: 4 }}>
            Recent output:
          </p>
          <pre className="artifact">{info.recentOutput || "(no output captured)"}</pre>
        </>
      )}
    </div>
  );
}
