import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The wording Joey sends around a task's own instructions — step messages, the review loop — lives in `src/engine/templates/*.md`
 * (see its README.md), not in code. Read on every call so an edit applies to the next message. `TEMPLATES_DIR` moves the folder.
 * `{{name}}` is replaced by `vars.name`; a trailing newline is dropped.
 */
export function template(name: string, vars: Record<string, string | number> = {}): string {
  // A local folder, not a project asset — turbopackIgnore stops Turbopack tracing the repo for it (same as db.ts).
  const path = resolve(/* turbopackIgnore: true */ process.env.TEMPLATES_DIR ?? resolve(/* turbopackIgnore: true */ process.cwd(), "src/engine/templates"), `${name}.md`);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`can't read the template ${path}: ${(err as Error).message}`);
  }
  return text.replace(/\n$/, "").replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}
