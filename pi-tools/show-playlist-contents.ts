import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { fetchPlaylistVideos } from "../src/engine/youtube.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "show_playlist_contents",
  label: "Show Playlist Contents",
  description: "List the videos inside a given YouTube playlist.",
  promptSnippet: "show_playlist_contents: list videos inside a YouTube playlist",
  parameters: Type.Object({ playlistId: Type.String({ description: "YouTube playlist id" }) }),
  async execute(_toolCallId, params) {
    return jsonResult(await fetchPlaylistVideos(params.playlistId));
  },
});
