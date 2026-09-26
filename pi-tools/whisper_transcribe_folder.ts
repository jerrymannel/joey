import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { transcribeFolder } from "../src/engine/transcription-run.ts";
import { errMsg, log } from "../src/engine/logger.ts";
import { jsonResult } from "./json-result.ts";
import { requireToolEnabled } from "./tool-access.ts";

export default defineTool({
  name: "whisper_transcribe_folder",
  label: "Transcribe Folder",
  description:
    "Transcribe every audio file under a folder (and its sub folders) that has no transcript yet, with whisper, saving each as <file>.transcribed.txt beside it. Skips files already transcribed. Slow for lots of audio. Returns a per-file log.",
  promptSnippet: "whisper_transcribe_folder: transcribe every new audio file under a folder",
  parameters: Type.Object({
    folder: Type.String({ description: "Absolute folder path to walk" }),
    extensions: Type.Optional(Type.String({ description: "Comma-separated audio extensions without dots, default mp3,wav" })),
  }),
  async execute(_toolCallId, params) {
    requireToolEnabled("whisper_transcribe_folder");
    const exts = (params.extensions ?? "mp3,wav").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const lines: string[] = [];
    try {
      await transcribeFolder(params.folder, exts, (line) => lines.push(line));
      return jsonResult({ folder: params.folder, log: lines });
    } catch (err) {
      log("whisper_transcribe_folder").error({ folder: params.folder, task: process.env.TASK_ID, run: process.env.RUN_ID, err: errMsg(err) }, "whisper_transcribe_folder failed");
      throw err;
    }
  },
});
