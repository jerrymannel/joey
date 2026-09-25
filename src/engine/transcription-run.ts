import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, sep } from "node:path";
import { transcribeAudio } from "./whisper.ts";
import { errMsg } from "./logger.ts";

/** A transcript is saved next to its audio as `<file name with extension>.transcribed.txt`, e.g. `talk.mp3.transcribed.txt`. */
export const TRANSCRIBED_SUFFIX = ".transcribed.txt";
/** Written at the root of the transcribed folder: the full path of every transcript under it, one per line. */
export const SUMMARY_FILE = "transcribed-files.txt";

/** Every file under `root` (absolute, sorted), skipping anything inside a dot-folder — that's where transcribeAudio keeps its scratch space. */
function listFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((rel) => !rel.split(sep).some((part) => part.startsWith(".")))
    .map((rel) => join(root, rel))
    .filter((f) => statSync(f, { throwIfNoEntry: false })?.isFile())
    .sort();
}

/**
 * Walks `root` and every sub folder for files with one of the lowercase `extensions` (no dots), transcribes each with whisper into
 * `<file>.transcribed.txt` beside it, then rewrites the summary file. A file that already has a transcript is skipped, so a scheduled
 * run only does what's new; one that fails is logged and the rest carry on, and it throws at the end if any did. Run by
 * scripts/transcribe-folder.
 */
export async function transcribeFolder(root: string, extensions: string[], note: (line: string) => void): Promise<void> {
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`folder not found: ${root}`);
  if (extensions.length === 0) throw new Error("no file extensions given");

  const files = listFiles(root).filter((f) => !f.endsWith(TRANSCRIBED_SUFFIX) && extensions.includes(extname(f).slice(1).toLowerCase()));
  let transcribed = 0;
  let failed = 0;
  for (const file of files) {
    const out = `${file}${TRANSCRIBED_SUFFIX}`;
    if (existsSync(out)) continue;
    note(`Transcribing ${file}`);
    try {
      await transcribeAudio(file, { outputPath: out });
      transcribed++;
    } catch (err) {
      failed++;
      note(`Failed: ${file} — ${errMsg(err)}`);
    }
  }

  const transcripts = listFiles(root).filter((f) => f.endsWith(TRANSCRIBED_SUFFIX));
  writeFileSync(join(root, SUMMARY_FILE), transcripts.map((f) => `${f}\n`).join(""));
  note(`Found ${files.length} matching file(s); transcribed ${transcribed}, skipped ${files.length - transcribed - failed} already done, ${failed} failed. ${transcripts.length} transcript(s) listed in ${join(root, SUMMARY_FILE)}`);
  if (failed > 0) throw new Error(`${failed} of ${files.length} file(s) failed to transcribe — see the log`);
}
