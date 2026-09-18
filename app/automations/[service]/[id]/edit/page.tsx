"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../../lib/api.ts";
import type { Task } from "../../../../lib/types.ts";
import AutomationForm from "../../../../components/AutomationForm.tsx";

export default function EditAutomationPage({ params }: { params: Promise<{ service: string; id: string }> }) {
  const { service, id } = usePromise(params);
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Task>(`/api/tasks/${id}`)
      .then(setTask)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  if (!task) {
    return error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>;
  }

  return (
    <>
      <p className="crumb">
        <Link href={`/automations/${service}/${id}`}>← {task.name}</Link>
      </p>
      <div className="page-header">
        <h1>Edit automation</h1>
      </div>
      <AutomationForm
        service={task.service}
        initial={task}
        onCancel={() => router.push(`/automations/${service}/${id}`)}
        onSaved={() => router.push(`/automations/${service}/${id}`)}
      />
    </>
  );
}
