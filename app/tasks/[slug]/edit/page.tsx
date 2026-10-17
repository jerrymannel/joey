"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { api } from "../../../lib/api.ts";
import type { TaskDetail } from "../../../lib/types.ts";
import TaskForm from "../../TaskForm.tsx";

export default function EditTaskPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = usePromise(params);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<TaskDetail>(`/api/tasks/${slug}`).then(setDetail).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [slug]);

  return (
    <>
      <p className="crumb">
        <Link href={`/tasks/${slug}`}>← {detail?.task?.name ?? slug}</Link>
      </p>
      <div className="page-header">
        <h1>Edit task</h1>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!detail ? (
        !error && <p className="muted">Loading…</p>
      ) : detail.task ? (
        <TaskForm existing={detail.task} />
      ) : (
        <div className="error-banner">
          tasks/{slug}.yaml has errors, so the form can&apos;t load it — fix it in the <Link href={`/tasks/${slug}`}>Yaml tab</Link> first.
        </div>
      )}
    </>
  );
}
