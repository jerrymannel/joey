import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { fetchMyPlaylists } from "../src/engine/youtube.ts";
import { jsonResult } from "./json-result.ts";
import { requireToolEnabled } from "./tool-access.ts";

export default defineTool({
  name: "youtube_list_playlists",
  label: "List Playlists",
  description: "List the connected YouTube account's own playlists.",
  promptSnippet: "youtube_list_playlists: list the connected account's YouTube playlists",
  parameters: Type.Object({}),
  async execute() {
    requireToolEnabled("youtube_list_playlists");
    return jsonResult(await fetchMyPlaylists());
  },
});
