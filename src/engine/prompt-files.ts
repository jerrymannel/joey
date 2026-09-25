import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The wording Joey adds around a task's prompt lives in `src/engine/templates/*.md` (see its README.md), not in code.
 * Read on every call so an edit applies to the next run. Folder: `PROMPTS_DIR`, else `./src/engine/templates` — pi's tools
 * run cwd'd to the task's own folder, so pi-herdr.ts passes it as an absolute path (like DATA_DB_PATH).
 * `{{name}}` is replaced by `vars.name`; a trailing newline is dropped.
 */
export function promptFile(name: string, vars: Record<string, string | number> = {}): string {
  // A local folder, not a project asset — turbopackIgnore stops Turbopack tracing the repo for it (same as db.ts).
  const path = resolve(/* turbopackIgnore: true */ process.env.PROMPTS_DIR ?? resolve(/* turbopackIgnore: true */ process.cwd(), "src/engine/templates"), `${name}.md`);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`can't read the prompt file ${path}: ${(err as Error).message}`);
  }
  return text.replace(/\n$/, "").replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}
