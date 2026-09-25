import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// process.cwd(), not import.meta.dirname: Next.js's Turbopack build doesn't
// populate import.meta.dirname the same way plain Node ESM does, and every
// real invocation of this module (Next.js server, tests, the `start-run` CLI
// entry) already runs with cwd = repo root.
const REPO_ROOT = process.cwd();

/** data.db: what the app works on — a yaml task's runtime state (the task itself is tasks/<slug>.yaml). */
const DATA_DB_TABLES = `
CREATE TABLE IF NOT EXISTS task_state (
  slug        TEXT PRIMARY KEY,
  paused      INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);
DROP TABLE IF EXISTS tasks;
`;

/** settings.db: the settings (workspace folder, Google clients and accounts, the result sender and your email) and SSH configurations. */
const SETTINGS_DB_TABLES = `
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ssh_configs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  host        TEXT NOT NULL,
  username    TEXT NOT NULL,
  auth_method TEXT NOT NULL,
  secret      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS prompts;
DROP TABLE IF EXISTS tools;
`;

/** logs.db: run history. */
const LOGS_DB_TABLES = `
CREATE TABLE IF NOT EXISTS task_runs (
  id            TEXT PRIMARY KEY,
  task_slug     TEXT NOT NULL,
  status        TEXT NOT NULL,
  run_dir       TEXT NOT NULL,
  log           TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  started_at    TEXT NOT NULL,
  ended_at      TEXT
);

CREATE TABLE IF NOT EXISTS run_steps (
  run_id        TEXT NOT NULL,
  idx           INTEGER NOT NULL,
  label         TEXT NOT NULL,
  status        TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  output_file   TEXT NOT NULL DEFAULT '',
  started_at    TEXT,
  ended_at      TEXT,
  PRIMARY KEY (run_id, idx)
);
DROP TABLE IF EXISTS runs;
DROP TABLE IF EXISTS youtube_runs;
`;

/** The three databases live side by side in `data/`; setting DATA_DB_PATH moves them all (settings.db and logs.db sit beside it unless SETTINGS_DB_PATH / LOGS_DB_PATH say otherwise). */
export function dataDbPath(): string {
  return resolve(/* turbopackIgnore: true */ process.env.DATA_DB_PATH ?? resolve(/* turbopackIgnore: true */ REPO_ROOT, "data/data.db"));
}

export function settingsDbPath(): string {
  return resolve(/* turbopackIgnore: true */ process.env.SETTINGS_DB_PATH ?? join(dirname(dataDbPath()), "settings.db"));
}

export function logsDbPath(): string {
  return resolve(/* turbopackIgnore: true */ process.env.LOGS_DB_PATH ?? join(dirname(dataDbPath()), "logs.db"));
}

/** Tables are created as each database opens; the DROPs clear out the model this app had before tasks were yaml files (docs/redesign.md). */
function openDb(path: string, migrations: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(migrations);
  return db;
}

let dataDb: Database.Database | undefined;
let settingsDb: Database.Database | undefined;
let logsDb: Database.Database | undefined;

export function getDataDb(): Database.Database {
  return (dataDb ??= openDb(dataDbPath(), DATA_DB_TABLES));
}

export function getSettingsDb(): Database.Database {
  return (settingsDb ??= openDb(settingsDbPath(), SETTINGS_DB_TABLES));
}

export function getLogsDb(): Database.Database {
  return (logsDb ??= openDb(logsDbPath(), LOGS_DB_TABLES));
}
