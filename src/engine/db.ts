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
  service     TEXT NOT NULL DEFAULT 'generic',
  tool_ids    TEXT NOT NULL DEFAULT '[]',
  search_query TEXT NOT NULL DEFAULT '',
  playlist_id TEXT NOT NULL DEFAULT '',
  thinking_level TEXT NOT NULL DEFAULT '',
  trust_folder INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS models (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  value       TEXT NOT NULL,
  endpoint    TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tools (
  id          TEXT PRIMARY KEY,
  service     TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS youtube_runs (
  id            TEXT PRIMARY KEY,
  video_id      TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  artifact_dir  TEXT NOT NULL,
  status        TEXT NOT NULL,
  error_message TEXT,
  started_at    TEXT NOT NULL,
  ended_at      TEXT
);
`;

/** CREATE TABLE IF NOT EXISTS doesn't retrofit columns onto a table that already exists from before they were added — add them by hand so an existing local data.db (which holds OAuth tokens worth keeping) doesn't need deleting. */
function ensureColumn(db: Database.Database, table: string, column: string, ddl: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function openDb(envVar: string, defaultRelPath: string, migrations: string): Database.Database {
  // This is a local sqlite file path, not a project asset — turbopackIgnore stops Turbopack
  // from tracing/bundling the whole repo just because the path isn't statically known.
  const defaultPath = resolve(/* turbopackIgnore: true */ REPO_ROOT, defaultRelPath);
  const path = resolve(/* turbopackIgnore: true */ process.env[envVar] ?? defaultPath);
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(migrations);
  if (migrations === DATA_DB_TABLES) {
    ensureColumn(db, "tasks", "service", "service TEXT NOT NULL DEFAULT 'generic'");
    ensureColumn(db, "tasks", "tool_ids", "tool_ids TEXT NOT NULL DEFAULT '[]'");
    ensureColumn(db, "tasks", "search_query", "search_query TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "tasks", "playlist_id", "playlist_id TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "tasks", "thinking_level", "thinking_level TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "tasks", "trust_folder", "trust_folder INTEGER NOT NULL DEFAULT 0");
    ensureColumn(db, "models", "endpoint", "endpoint TEXT NOT NULL DEFAULT ''");
  }
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
