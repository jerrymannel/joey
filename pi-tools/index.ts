import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import searchEmails from "./gmail_search_emails.ts";
import readEmail from "./gmail_read_email.ts";
import listLabels from "./gmail_list_labels.ts";
import createLabel from "./gmail_create_label.ts";
import deleteLabel from "./gmail_delete_label.ts";
import labelEmail from "./gmail_label_email.ts";
import listPlaylists from "./youtube_list_playlists.ts";
import showPlaylistContents from "./youtube_show_playlist_contents.ts";
import sendMessage from "./mailbox_send_message.ts";
import listAgents from "./mailbox_list_agents.ts";
import sendResult from "./mailbox_send_result.ts";
import listMailLabels from "./mailbox_list_labels.ts";
import labelMail from "./mailbox_label_mail.ts";
import listServers from "./ssh_list_servers.ts";
import runCommand from "./ssh_run_command.ts";
import transcribeAudio from "./whisper_transcribe_audio.ts";

// pi runs in the herdr pane's shell, which never saw the app's .env.local — without SETTINGS_ENCRYPTION_KEY every tool that
// reads a setting throws. Load it from the repo (existing env vars win); a missing file is fine, the shell may export it.
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch {}

/**
 * Real, callable pi tools backing tools.ts's DEFAULT_TOOLS — see harness.ts's buildArgs(), which
 * loads this file with `--extension` for every pi run. One file per tool (this is just the
 * registration entry point); only the tools with a working engine function are wired up
 * (search/read email, list/show playlist) — the rest (YouTube search, add to playlist, video
 * details) stay prompt-text-only via harness.ts's withTools() until they have one too. Every tool
 * registered here needs a row in tools.ts's DEFAULT_TOOLS so it shows under Configurations → Tools. ponytail:
 * which of these are actually relevant to a given task is still just a prompt hint from
 * withTools(), not an enforced allowlist — upgrade path is a stable per-tool key if that ever
 * needs to be a real restriction.
 */
export default function (pi: ExtensionAPI) {
  pi.registerTool(searchEmails);
  pi.registerTool(readEmail);
  pi.registerTool(listLabels);
  pi.registerTool(createLabel);
  pi.registerTool(deleteLabel);
  pi.registerTool(labelEmail);
  pi.registerTool(listPlaylists);
  pi.registerTool(showPlaylistContents);
  pi.registerTool(sendMessage);
  pi.registerTool(listAgents);
  pi.registerTool(sendResult);
  pi.registerTool(listMailLabels);
  pi.registerTool(labelMail);
  pi.registerTool(listServers);
  pi.registerTool(runCommand);
  pi.registerTool(transcribeAudio);
}
