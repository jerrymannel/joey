"use client";

import ReactMarkdown from "react-markdown";

/** Renders markdown (result.md, conversation.md, step output) — no raw HTML, so it's safe by default. */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
