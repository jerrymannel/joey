import { join } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { downloadVideoAndWait } from "../src/engine/youtube-download.ts";
import { errMsg, log } from "../src/engine/logger.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "youtube_download_video",
  label: "Download YouTube Video",
  description:
    "Download one YouTube video's mp4, audio (mp3) and subtitles into <folder>/<videoId>/, optionally with a whisper transcript of the audio. Slow — can take minutes. Returns the folder and final state.",
  promptSnippet: "youtube_download_video: download a YouTube video's mp4/audio/subtitles to a folder",
  parameters: Type.Object({
    videoId: Type.String({ description: "YouTube video id (the v= part of a watch URL)" }),
    transcribe: Type.Optional(Type.Boolean({ description: "Also transcribe the audio with whisper (default false); slow" })),
    folder: Type.Optional(Type.String({ description: "Folder to download into; the video goes in <folder>/<videoId>/. Default: the task folder (TASK_DIR), kept across runs" })),
  }),
  async execute(_toolCallId, params) {
    const folder = params.folder ?? process.env.TASK_DIR;
    if (!folder) throw new Error("no folder given and TASK_DIR isn't set");
    try {
      const job = await downloadVideoAndWait(params.videoId, folder, params.transcribe ?? false);
      return jsonResult({ videoId: params.videoId, folder: join(folder, params.videoId), state: job.state });
    } catch (err) {
      log("youtube_download_video").error({ videoId: params.videoId, task: process.env.TASK_ID, run: process.env.RUN_ID, err: errMsg(err) }, "youtube_download_video failed");
      throw err;
    }
  },
});
