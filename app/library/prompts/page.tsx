"use client";

import FileLibrary from "../../components/FileLibrary.tsx";

export default function PromptsPage() {
  return (
    <FileLibrary
      title="Prompts"
      folder="prompts"
      endpoint="/api/library/prompts"
      placeholder="summarise-emails"
      intro={
        <>
          The files in <code>prompts/</code>. An agent step names one as its <code>instructionsFile:</code>; it&apos;s read at run time, so an edit applies to the next run.
        </>
      }
    />
  );
}
