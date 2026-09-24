import { after, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcribeAudio } from "./whisper.ts";
import { installFakeHerdr } from "../test-support/fake-herdr.ts";

const root = mkdtempSync(join(tmpdir(), "joey-whisper-test-"));
after(() => rmSync(root, { recursive: true }));
const { calls } = installFakeHerdr(root);

// A stand-in for `whisper`: writes its own args to <output_dir>/<audio name>.txt, like the real CLI's txt output.
const fake = join(root, "fake-whisper.sh");
writeFileSync(fake, `#!/bin/sh\nf="$1"; a="$*"; while [ $# -gt 0 ]; do [ "$1" = "--output_dir" ] && out="$2"; shift; done\nn=$(basename "$f")\necho "$a" > "$out/\${n%.*}.txt"\n`);
chmodSync(fake, 0o755);

test("transcribeAudio runs whisper with the model/language and returns the .txt written next to the audio", async () => {
  const audio = join(root, "audio.mp3");
  writeFileSync(audio, "x");
  process.env.JOEY_WHISPER_BIN = fake;
  try {
    const r = await transcribeAudio(audio, { language: "en" });
    assert.equal(r.transcriptPath, join(root, "audio.txt"));
    assert.match(readFileSync(calls, "utf8"), /tab create --cwd .* --label whisper:audio\.mp3/); // ran in a herdr tab
    assert.equal(r.text.trim(), `${audio} --model base --output_format txt --output_dir ${root} --language en`);
  } finally {
    delete process.env.JOEY_WHISPER_BIN;
  }
});

test("transcribeAudio rejects a missing file, a failing whisper and a missing binary", async () => {
  await assert.rejects(transcribeAudio(join(root, "nope.mp3")), /audio file not found/);
  const audio = join(root, "a.mp3");
  writeFileSync(audio, "x");
  const bad = join(root, "bad-whisper.sh");
  writeFileSync(bad, "#!/bin/sh\necho 'no ffmpeg' >&2\nexit 1\n");
  chmodSync(bad, 0o755);
  process.env.JOEY_WHISPER_BIN = bad;
  try {
    await assert.rejects(transcribeAudio(audio), /whisper failed: no ffmpeg/);
    process.env.JOEY_WHISPER_BIN = join(root, "missing");
    await assert.rejects(transcribeAudio(audio), /isn't installed/);
  } finally {
    delete process.env.JOEY_WHISPER_BIN;
  }
});
