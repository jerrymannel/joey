import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// process.cwd(), not import.meta.dirname: Next.js's Turbopack build doesn't
// populate import.meta.dirname the same way plain Node ESM does, and every
// real invocation of this module (Next.js server, tests, the orchestrator's
// own `pi -e` CLI entry) already runs with cwd = repo root — the orchestrator
// itself never hits this default anyway since its DATA_DB_PATH/LOGS_DB_PATH
// are always passed explicitly via `--env`.
const REPO_ROOT = process.cwd();

const DATA_DB_TABLES = `
CREATE TABLE IF NOT EXISTS tasks (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  folder_path           TEXT NOT NULL UNIQUE,
  is_git_repo           INTEGER NOT NULL,
  orchestrator_goal     TEXT NOT NULL DEFAULT '',
  secrets_file_path     TEXT,
  max_parallel_workers  INTEGER NOT NULL DEFAULT 3,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_roles (
  id                TEXT PRIMARY KEY,
  task_id           TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  is_reviewer       INTEGER NOT NULL DEFAULT 0,
  system_prompt     TEXT NOT NULL,
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  tools_allowlist   TEXT,
  tools_denylist    TEXT,
  artifact_path     TEXT NOT NULL,
  artifact_schema   TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
`;

const LOGS_DB_TABLES = `
CREATE TABLE IF NOT EXISTS runs (
  id                TEXT PRIMARY KEY,
  task_id           TEXT NOT NULL,
  herdr_workspace_id TEXT,
  status            TEXT NOT NULL,
  started_at        TEXT NOT NULL,
  ended_at          TEXT
);

CREATE TABLE IF NOT EXISTS workers (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  role_id           TEXT NOT NULL,
  role_name         TEXT NOT NULL,
  worktree_path     TEXT,
  branch_name       TEXT,
  herdr_pane_id     TEXT,
  status            TEXT NOT NULL,
  artifact_success  INTEGER,
  artifact_message  TEXT,
  reviewed_worker_id TEXT REFERENCES workers(id),
  merge_approved_at TEXT,
  merged_at         TEXT,
  started_at        TEXT NOT NULL,
  ended_at          TEXT
);

CREATE TABLE IF NOT EXISTS status_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id   TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  detail      TEXT,
  occurred_at TEXT NOT NULL
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
  db.pragma("foreign_keys = ON");
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

/** Absolute path this process is using for data.db — pass to the orchestrator's --env so it opens the same file. */
export function getDataDbPath(): string {
  return getDataDb().name;
}

export function getLogsDbPath(): string {
  return getLogsDb().name;
}
