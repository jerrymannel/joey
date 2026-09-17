import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// process.cwd(), not import.meta.dirname: Next.js's Turbopack build doesn't
// populate import.meta.dirname the same way plain Node ESM does, and every
// real invocation of this module (Next.js server, tests, the `start-run` CLI
// entry) already runs with cwd = repo root.
const REPO_ROOT = process.cwd();

const DATA_DB_TABLES = `
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  folder_path TEXT NOT NULL UNIQUE,
  prompt      TEXT NOT NULL DEFAULT '',
  harness     TEXT NOT NULL DEFAULT 'pi',
  cli_params  TEXT NOT NULL DEFAULT '',
  model       TEXT NOT NULL DEFAULT '',
  schedule    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
`;

const LOGS_DB_TABLES = `
CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL,
  status        TEXT NOT NULL,
  output        TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  started_at    TEXT NOT NULL,
  ended_at      TEXT
);
`;

function openDb(envVar: string, defaultRelPath: string, migrations: string): Database.Database {
  // This is a local sqlite file path, not a project asset — turbopackIgnore stops Turbopack
  // from tracing/bundling the whole repo just because the path isn't statically known.
  const defaultPath = resolve(/* turbopackIgnore: true */ REPO_ROOT, defaultRelPath);
  const path = resolve(/* turbopackIgnore: true */ process.env[envVar] ?? defaultPath);
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(migrations);
  return db;
}

let dataDb: Database.Database | undefined;
let logsDb: Database.Database | undefined;

export function getDataDb(): Database.Database {
  return (dataDb ??= openDb("DATA_DB_PATH", "data/data.db", DATA_DB_TABLES));
}

export function getLogsDb(): Database.Database {
  return (logsDb ??= openDb("LOGS_DB_PATH", "data/logs.db", LOGS_DB_TABLES));
}
