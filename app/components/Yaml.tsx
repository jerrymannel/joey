"use client";

import type { ReactNode } from "react";
import { parseDocument } from "yaml";

/** Re-indents yaml the `yaml` package's way, keeping comments. Throws the first parse error, so a broken file isn't mangled. */
export function formatYaml(source: string): string {
  const doc = parseDocument(source);
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  return doc.toString({ lineWidth: 0 });
}

const KEY = /^(\s*(?:-\s+)?)("[^"]*"|'[^']*'|[^\s#'"-][^:#]*|-[^\s:#][^:#]*)(:)(?=\s|$)(.*)$/;
const LITERAL = /^(-?\d+(\.\d+)?|true|false|null|~)$/;

function value(text: string): ReactNode {
  const hash = text.search(/(^|\s)#/);
  const [v, comment] = hash < 0 ? [text, ""] : [text.slice(0, hash), text.slice(hash)];
  const t = v.trim();
  const cls = !t ? "" : LITERAL.test(t) ? "yaml-literal" : /^[|>][-+0-9]*$/.test(t) ? "yaml-punct" : "yaml-string";
  return (
    <>
      {cls ? <span className={cls}>{v}</span> : v}
      {comment && <span className="yaml-comment">{comment}</span>}
    </>
  );
}

/**
 * Yaml with light syntax colouring (keys, scalars, comments). A line-based pass, not a parser —
 * ponytail: good enough for the hand-edited task files; swap in a real highlighter if flow maps/anchors show up.
 */
export default function Yaml({ source }: { source: string }) {
  let blockIndent = -1; // inside a `|`/`>` block scalar: lines indented deeper than its key are plain text
  const lines = source.split("\n").map((line, i) => {
    const indent = line.search(/\S/);
    if (blockIndent >= 0 && (indent < 0 || indent > blockIndent)) return <span key={i} className="yaml-string">{line}{"\n"}</span>;
    blockIndent = -1;
    if (line.trimStart().startsWith("#")) return <span key={i} className="yaml-comment">{line}{"\n"}</span>;
    const m = KEY.exec(line);
    if (!m) {
      const dash = /^(\s*-\s+)(.*)$/.exec(line);
      return <span key={i}>{dash ? <><span className="yaml-punct">{dash[1]}</span>{value(dash[2])}</> : line}{"\n"}</span>;
    }
    const [, lead, key, colon, rest] = m;
    if (/^\s*[|>][-+0-9]*\s*(#.*)?$/.test(rest)) blockIndent = indent;
    return (
      <span key={i}>
        <span className="yaml-punct">{lead}</span>
        <span className="yaml-key">{key}</span>
        <span className="yaml-punct">{colon}</span>
        {value(rest)}
        {"\n"}
      </span>
    );
  });
  return <pre className="artifact yaml" style={{ maxHeight: "none", whiteSpace: "pre" }}>{lines}</pre>;
}
