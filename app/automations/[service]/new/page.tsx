"use client";

import { use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TaskService } from "../../../lib/types.ts";
import AutomationForm from "../../../components/AutomationForm.tsx";

export default function NewAutomationPage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = usePromise(params);
  const router = useRouter();

  return (
    <>
      <p className="crumb">
        <Link href={`/automations/${service}`}>← {service === "gmail" ? "Gmail" : "YouTube"} automations</Link>
      </p>
      <div className="page-header">
        <h1>New automation</h1>
      </div>
      <AutomationForm
        service={service as TaskService}
        onCancel={() => router.push(`/automations/${service}`)}
        onSaved={(task) => router.push(`/automations/${service}/${task.id}`)}
      />
    </>
  );
}
