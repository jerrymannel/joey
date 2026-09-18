import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import searchEmails from "./search-emails.ts";
import readEmail from "./read-email.ts";
import listPlaylists from "./list-playlists.ts";
import showPlaylistContents from "./show-playlist-contents.ts";

/**
 * Real, callable pi tools backing tools.ts's DEFAULT_TOOLS — see harness.ts's buildArgs(), which
 * loads this file with `--extension` for every pi run. One file per tool (this is just the
 * registration entry point); only the tools with a working engine function are wired up
 * (search/read email, list/show playlist) — the rest (YouTube search, add to playlist, video
 * details) stay prompt-text-only via harness.ts's withTools() until they have one too. ponytail:
 * which of these are actually relevant to a given task is still just a prompt hint from
 * withTools(), not an enforced allowlist — upgrade path is a stable per-tool key if that ever
 * needs to be a real restriction.
 */
export default function (pi: ExtensionAPI) {
  pi.registerTool(searchEmails);
  pi.registerTool(readEmail);
  pi.registerTool(listPlaylists);
  pi.registerTool(showPlaylistContents);
}
