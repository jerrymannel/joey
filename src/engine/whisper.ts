import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import * as herdr from "./herdr.ts";
import { log } from "./logger.ts";

const wlog = log("whisper");

export interface Transcript {
  transcriptPath: string;
  text: string;
}

/**
 * Transcribes an audio file with the `openai-whisper` CLI, run in a herdr tab like every command Joey runs (override the binary with JOEY_WHISPER_BIN, the default model with JOEY_WHISPER_MODEL)
 * and waits for it. The transcript is written next to the audio file as `<name>.txt` — for a YouTube download that's `<videoId>/audio.txt` — or, with
 * `outputPath`, there instead (whisper runs in a scratch folder beside it and the result is moved into place, so nothing already in the folder is overwritten).
 */
export async function transcribeAudio(file: string, opts: { model?: string; language?: string; timeoutSec?: number; outputPath?: string } = {}): Promise<Transcript> {
  if (!existsSync(file)) throw new Error(`audio file not found: ${file}`);
  const model = opts.model ?? process.env.JOEY_WHISPER_MODEL ?? "base";
  const dir = opts.outputPath ? mkdtempSync(join(dirname(opts.outputPath), ".whisper-")) : dirname(file);
  const args = [file, "--model", model, "--output_format", "txt", "--output_dir", dir, ...(opts.language ? ["--language", opts.language] : [])];
  wlog.debug({ file, model, language: opts.language }, "whisper transcribe");
  try {
    await run(args, dirname(file), `whisper:${basename(file)}`, opts.timeoutSec);
    const produced = join(dir, `${basename(file, extname(file))}.txt`);
    if (opts.outputPath) renameSync(produced, opts.outputPath);
    const transcriptPath = opts.outputPath ?? produced;
    return { transcriptPath, text: readFileSync(/* turbopackIgnore: true */ transcriptPath, "utf8") };
  } finally {
    if (opts.outputPath) rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs whisper in its own herdr tab, its output both shown there and kept in a temp log, whose tail is the error if it fails. */
async function run(args: string[], cwd: string, label: string, timeoutSec = 1800): Promise<void> {
  const scratch = mkdtempSync(join(tmpdir(), "joey-whisper-"));
  const logFile = join(scratch, "whisper.log");
  const line = [process.env.JOEY_WHISPER_BIN ?? "whisper", ...args].map(herdr.shellQuote).join(" ");
  try {
    const { exitCode, timedOut } = await herdr.runInTab(cwd, label, herdr.bashPipeline(`${line} 2>&1 | tee ${herdr.shellQuote(logFile)}`), timeoutSec * 1000);
    if (timedOut) throw new Error("whisper failed: timed out");
    if (exitCode === 0) return;
    const output = readFileSync(/* turbopackIgnore: true */ logFile, "utf8").trim().split("\n").slice(-10).join("\n");
    const why = exitCode === 127 ? "whisper isn't installed (uv tool install openai-whisper — see the README)" : output || `exit code ${exitCode}`;
    throw new Error(`whisper failed: ${why}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
