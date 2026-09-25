import { after, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeHerdr } from "../test-support/fake-herdr.ts";
import { transcribeFolder, SUMMARY_FILE } from "./transcription-run.ts";

const root = mkdtempSync(join(tmpdir(), "joey-transcription-run-test-"));
after(() => rmSync(root, { recursive: true }));
installFakeHerdr(root);

// A stand-in for `whisper`: writes "T:<audio file name>" to <output_dir>/<audio name without extension>.txt; any file with "bad" in its name fails.
const fake = join(root, "fake-whisper.sh");
writeFileSync(fake, `#!/bin/sh\nf="$1"; while [ $# -gt 0 ]; do [ "$1" = "--output_dir" ] && out="$2"; shift; done\ncase "$f" in *bad*) echo boom >&2; exit 1;; esac\nn=$(basename "$f")\necho "T:$n" > "$out/\${n%.*}.txt"\n`);
chmodSync(fake, 0o755);
process.env.JOEY_WHISPER_BIN = fake;

function tree(name: string, files: string[]): string {
  const dir = join(root, name);
  for (const f of files) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), "x");
  }
  return dir;
}

test("walks sub folders, matches extensions case-insensitively, names transcripts <file>.transcribed.txt, skips done ones, and lists every transcript", async () => {
  const dir = tree("a", ["a.mp3", "sub/deep/b.WAV", "sub/notes.txt", ".hidden/h.mp3", "e.mp3", "e.mp3.transcribed.txt"]);
  const notes: string[] = [];
  await transcribeFolder(dir, ["mp3", "wav"], (l) => notes.push(l));

  assert.equal(readFileSync(join(dir, "a.mp3.transcribed.txt"), "utf8"), "T:a.mp3\n");
  assert.equal(readFileSync(join(dir, "sub/deep/b.WAV.transcribed.txt"), "utf8"), "T:b.WAV\n");
  assert.equal(readFileSync(join(dir, "e.mp3.transcribed.txt"), "utf8"), "x"); // already transcribed: left alone
  assert.equal(existsSync(join(dir, ".hidden/h.mp3.transcribed.txt")), false);
  assert.equal(existsSync(join(dir, "sub/notes.txt.transcribed.txt")), false);
  assert.deepEqual(readdirSync(dir).filter((n) => n.startsWith(".whisper-")), []); // scratch space cleaned up
  assert.equal(
    readFileSync(join(dir, SUMMARY_FILE), "utf8"),
    [join(dir, "a.mp3.transcribed.txt"), join(dir, "e.mp3.transcribed.txt"), join(dir, "sub/deep/b.WAV.transcribed.txt")].map((p) => `${p}\n`).join(""),
  );
  assert.equal(notes.filter((n) => n.startsWith("Transcribing")).length, 2);

  // A second run has nothing new to do.
  notes.length = 0;
  await transcribeFolder(dir, ["mp3", "wav"], (l) => notes.push(l));
  assert.equal(notes.filter((n) => n.startsWith("Transcribing")).length, 0);
});

test("a file that fails is logged and the rest still run; the run fails after writing the summary", async () => {
  const dir = tree("b", ["bad.mp3", "good.mp3"]);
  const notes: string[] = [];
  await assert.rejects(transcribeFolder(dir, ["mp3"], (l) => notes.push(l)), /1 of 2 file\(s\) failed/);
  assert.ok(notes.some((n) => /Failed: .*bad\.mp3 — .*boom/.test(n)));
  assert.equal(readFileSync(join(dir, SUMMARY_FILE), "utf8"), `${join(dir, "good.mp3.transcribed.txt")}\n`);
});

test("a missing folder or no extensions is an error", async () => {
  await assert.rejects(transcribeFolder(join(root, "nope"), ["mp3"], () => {}), /folder not found/);
  await assert.rejects(transcribeFolder(root, [], () => {}), /no file extensions/);
});
