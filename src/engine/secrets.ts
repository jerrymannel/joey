import { readFile } from "node:fs/promises";

/** Parses a `.env`-style file (`KEY=VALUE` per line, `#` comments, blank lines skipped). */
export function parseEnvFile(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) env[key] = value;
  }
  return env;
}

export class SecretsFileMissingError extends Error {
  constructor(path: string) {
    super(`secrets file not found: ${path}`);
    this.name = "SecretsFileMissingError";
  }
}

/** Reads and parses a task's secrets file. Throws if `path` is set but the file is missing. */
export async function loadSecretsEnv(path: string | null): Promise<Record<string, string>> {
  if (!path) return {};
  try {
    const text = await readFile(path, "utf-8");
    return parseEnvFile(text);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new SecretsFileMissingError(path);
    throw err;
  }
}
