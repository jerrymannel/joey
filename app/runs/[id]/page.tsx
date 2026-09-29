"use client";

import { use as usePromise } from "react";
import RunView from "../../components/RunView.tsx";

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  return <RunView id={id} />;
}
