import Database from "better-sqlite3";
import { dirname, join } from "node:path";

/**
 * youtube.db, beside the engine's databases (DATA_DB_PATH) like gmail.db: one row per video a task has listed for processing. youtube-playlist
 * adds it (processed_at empty) when it hands the video on; youtube-processed stamps processed_at once the run has filed it. A processed video is
 * never downloaded or listed again by that task.
 */
export function youtubeDb(): Database.Database {
  const db = new Database(join(dirname(process.env.DATA_DB_PATH!), "youtube.db"));
  db.pragma("journal_mode = WAL");
  db.exec(
    "CREATE TABLE IF NOT EXISTS videos (task TEXT NOT NULL, id TEXT NOT NULL, title TEXT, listed_at TEXT NOT NULL, processed_at TEXT, PRIMARY KEY (task, id))",
  );
  return db;
}
