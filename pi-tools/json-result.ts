import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";

/** Serializes a result and truncates it to pi's output limits — see docs/extensions.md's "Output Truncation". */
export function jsonResult(value: unknown) {
  const truncation = truncateHead(JSON.stringify(value, null, 2), {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  return { content: [{ type: "text" as const, text: truncation.content }], details: {} };
}
