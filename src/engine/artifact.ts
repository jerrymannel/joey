import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ArtifactFieldType = "string" | "number" | "boolean";

export type ArtifactSchema = {
  required: string[];
  fields: Record<string, ArtifactFieldType>;
};

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export function validate(content: unknown, schema: ArtifactSchema): ValidationResult {
  const errors: string[] = [];
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    return { ok: false, errors: ["artifact content is not a JSON object"] };
  }
  const obj = content as Record<string, unknown>;
  for (const field of schema.required) {
    if (!(field in obj)) errors.push(`missing required field "${field}"`);
  }
  for (const [field, type] of Object.entries(schema.fields)) {
    if (!(field in obj)) continue;
    if (typeof obj[field] !== type) {
      errors.push(`field "${field}" expected ${type}, got ${typeof obj[field]}`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

export interface DoneMarker {
  success: boolean;
  message: string;
}

export async function readDoneMarker(worktreeOrTaskPath: string): Promise<DoneMarker | undefined> {
  try {
    const text = await readFile(join(worktreeOrTaskPath, ".orchestrator", "done.json"), "utf-8");
    const parsed = JSON.parse(text) as Partial<DoneMarker>;
    if (typeof parsed.success !== "boolean" || typeof parsed.message !== "string") return undefined;
    return { success: parsed.success, message: parsed.message };
  } catch {
    return undefined;
  }
}

export interface ArtifactReadResult {
  content: string;
  parsed?: unknown;
  validation?: ValidationResult;
}

export async function readArtifact(
  worktreeOrTaskPath: string,
  artifactPath: string,
  schema: ArtifactSchema | null,
): Promise<ArtifactReadResult | undefined> {
  let content: string;
  try {
    content = await readFile(join(worktreeOrTaskPath, artifactPath), "utf-8");
  } catch {
    return undefined;
  }
  if (!schema) return { content };
  try {
    const parsed = JSON.parse(content);
    return { content, parsed, validation: validate(parsed, schema) };
  } catch {
    return { content, validation: { ok: false, errors: ["artifact is not valid JSON"] } };
  }
}
