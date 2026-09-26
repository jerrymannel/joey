import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { transcribeAudio } from "../src/engine/whisper.ts";
import { errMsg, log } from "../src/engine/logger.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "whisper_transcribe_audio",
  label: "Transcribe Audio",
  description:
    "Transcribe a local audio file to text with OpenAI Whisper. Returns the transcript and the path of the .txt saved next to the audio file. Slow for long audio — can take minutes.",
  promptSnippet: "whisper_transcribe_audio: transcribe a local audio file to text",
  parameters: Type.Object({
    path: Type.String({ description: "Absolute path of the audio file, e.g. a YouTube download's audio.mp3" }),
    model: Type.Optional(Type.String({ description: "Whisper model (tiny, base, small, medium, large; default base). Bigger is slower and more accurate" })),
    language: Type.Optional(Type.String({ description: "Spoken language, e.g. en (default: auto-detect)" })),
  }),
  async execute(_toolCallId, params) {
    try {
      return jsonResult(await transcribeAudio(params.path, params));
    } catch (err) {
      log("whisper_transcribe_audio").error({ path: params.path, task: process.env.TASK_ID, run: process.env.RUN_ID, err: errMsg(err) }, "whisper_transcribe_audio failed");
      throw err;
    }
  },
});
