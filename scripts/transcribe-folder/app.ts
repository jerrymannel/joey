import { output, param } from "../joey.ts";
import { transcribeFolder } from "../../src/engine/transcription-run.ts";

/** Transcribes every audio file under `folder` (and its sub folders) that has no transcript yet; see transcription-run.ts. */
const lines: string[] = [];
await transcribeFolder(param("folder")!, (param("extensions") ?? "mp3,wav").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean), (line) => {
  console.log(line);
  lines.push(line);
});
output(`${lines.join("\n")}\n`);
