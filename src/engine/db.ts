import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// process.cwd(), not import.meta.dirname: Next.js's Turbopack build doesn't
// populate import.meta.dirname the same way plain Node ESM does, and every
// real invocation of this module (Next.js server, tests, the `start-run` CLI
// entry) already runs with cwd = repo root.
const REPO_ROOT = process.cwd();

/** Not UNIQUE on folder_path: a plain task owns its folder (task-board.ts checks that), but a transcription automation only reads one and may share it. */
const TASKS_TABLE = `
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  folder_path TEXT NOT NULL,
  prompt      TEXT NOT NULL DEFAULT '',
  prompt_id   TEXT NOT NULL DEFAULT '',
  harness     TEXT NOT NULL DEFAULT 'pi',
  cli_params  TEXT NOT NULL DEFAULT '',
  model       TEXT NOT NULL DEFAULT '',
  schedule    TEXT,
  service     TEXT NOT NULL DEFAULT 'generic',
  tool_ids    TEXT NOT NULL DEFAULT '[]',
  search_query TEXT NOT NULL DEFAULT '',
  playlist_id TEXT NOT NULL DEFAULT '',
  extensions  TEXT NOT NULL DEFAULT '',
  transcribe  INTEGER NOT NULL DEFAULT 0,
  account     TEXT NOT NULL DEFAULT '',
  thinking_level TEXT NOT NULL DEFAULT '',
  trust_folder INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
`;

/** A yaml task's runtime state (docs/redesign.md) — the task itself is tasks/<slug>.yaml. */
const TASK_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS task_state (
  slug        TEXT PRIMARY KEY,
  paused      INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);
`;

/** data.db: what the app works on — the tasks. */
const DATA_DB_TABLES = TASKS_TABLE + TASK_STATE_TABLE;

/** settings.db: everything configurable — the settings (workspace/results folders, Google clients and accounts, mailbox, email) and the Configurations (models, prompts, SSH, tools). */
const SETTINGS_DB_TABLES = `
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
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS tools (
  id          TEXT PRIMARY KEY,
  service     TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
`;

/** logs.db: run history. */
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

/** A database from before folder_path stopped being UNIQUE still has that constraint, and SQLite can't drop one in place: rebuild the table (rows kept as they are). */
function dropFolderPathUnique(db: Database.Database): void {
  const indexes = db.prepare("PRAGMA index_list(tasks)").all() as { unique: number; origin: string }[];
  if (!indexes.some((i) => i.unique && i.origin === "u")) return;
  const columns = (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map((c) => c.name).join(", ");
  db.transaction(() => {
    db.exec("ALTER TABLE tasks RENAME TO tasks_old");
    db.exec(TASKS_TABLE);
    db.exec(`INSERT INTO tasks (${columns}) SELECT ${columns} FROM tasks_old`);
    db.exec("DROP TABLE tasks_old");
  })();
}

/** CREATE TABLE IF NOT EXISTS doesn't retrofit columns onto a table that already exists from before they were added — add them by hand so an existing local data.db (which holds OAuth tokens worth keeping) doesn't need deleting. */
function ensureColumn(db: Database.Database, table: string, column: string, ddl: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

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

const SETTINGS_TABLES = ["settings", "models", "prompts", "ssh_configs", "tools"];

/**
 * Before settings.db existed these tables lived in data.db (which holds OAuth tokens worth keeping): copy their rows across once, then drop them there.
 * Runs as settings.db opens, ahead of anything seeding it, so a copied tool keeps the id tasks refer to it by.
 */
function moveLegacySettings(db: Database.Database): void {
  const legacyPath = dataDbPath();
  if (!existsSync(/* turbopackIgnore: true */ legacyPath)) return;
  db.prepare("ATTACH DATABASE ? AS legacy").run(legacyPath);
  try {
    const legacy = new Set((db.prepare("SELECT name FROM legacy.sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name));
    const columns = (schema: string, table: string) => (db.prepare(`PRAGMA ${schema}.table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    db.transaction(() => {
      for (const table of SETTINGS_TABLES.filter((t) => legacy.has(t))) {
        const kept = columns("main", table);
        const shared = columns("legacy", table).filter((c) => kept.includes(c)).join(", ");
        db.exec(`INSERT OR IGNORE INTO main.${table} (${shared}) SELECT ${shared} FROM legacy.${table}`);
        db.exec(`DROP TABLE legacy.${table}`);
      }
    })();
  } finally {
    db.exec("DETACH DATABASE legacy");
  }
}

function openDb(path: string, migrations: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(migrations);
  if (migrations === SETTINGS_DB_TABLES) moveLegacySettings(db);
  if (migrations === DATA_DB_TABLES) {
    dropFolderPathUnique(db);
    ensureColumn(db, "tasks", "prompt_id", "prompt_id TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "tasks", "service", "service TEXT NOT NULL DEFAULT 'generic'");
    ensureColumn(db, "tasks", "tool_ids", "tool_ids TEXT NOT NULL DEFAULT '[]'");
    ensureColumn(db, "tasks", "search_query", "search_query TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "tasks", "playlist_id", "playlist_id TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "tasks", "extensions", "extensions TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "tasks", "transcribe", "transcribe INTEGER NOT NULL DEFAULT 0");
    ensureColumn(db, "tasks", "account", "account TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "tasks", "thinking_level", "thinking_level TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "tasks", "trust_folder", "trust_folder INTEGER NOT NULL DEFAULT 0");
  }
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
