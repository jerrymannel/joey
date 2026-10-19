import { output } from "../joey.ts";
import { youtubeDb } from "../youtube-db.ts";

/** Stamps processed_at on every video youtube-playlist listed for this task and no run has processed yet (youtube-db.ts). */
const db = youtubeDb();
const task = process.env.TASK_ID!;
const rows = db.prepare("UPDATE videos SET processed_at = ? WHERE task = ? AND processed_at IS NULL RETURNING id, title").all(new Date().toISOString(), task) as { id: string; title: string }[];
console.log(`Marked ${rows.length} video(s) processed`);
output(`${rows.length} video(s) marked processed:\n\n${rows.map((r) => `- ${r.title} (${r.id})`).join("\n")}\n`);
