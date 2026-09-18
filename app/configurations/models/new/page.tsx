"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import ModelForm from "../../../components/ModelForm.tsx";

export default function NewModelPage() {
  const router = useRouter();

  return (
    <>
      <p className="crumb">
        <Link href="/configurations/models">← Models</Link>
      </p>
      <div className="page-header">
        <h1>New model</h1>
      </div>

      <ModelForm
        onCancel={() => router.push("/configurations/models")}
        onSaved={(model) => router.push(`/configurations/models/${model.id}`)}
      />
    </>
  );
}
