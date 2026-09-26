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
import downloadVideo from "./youtube_download_video.ts";
import listServers from "./ssh_list_servers.ts";
import runCommand from "./ssh_run_command.ts";
import transcribeAudio from "./whisper_transcribe_audio.ts";
import transcribeFolder from "./whisper_transcribe_folder.ts";
import sendTaskResult from "./task_send_result.ts";
import reviewVerdict from "./task_review_verdict.ts";

// pi runs in the herdr pane's shell, which never saw the app's .env.local — without SETTINGS_ENCRYPTION_KEY every tool that
// reads a setting throws. Load it from the repo (existing env vars win); a missing file is fine, the shell may export it.
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch {}

/**
 * Joey's own pi tools, loaded into every agent with `--extension` (agent-session.ts). One file per tool, each needing an entry in
 * tools.ts's catalog. pi registers all of them for every agent, so each tool that reaches anything real checks the agent's own
 * `tools:` list (tool-access.ts); task_send_result and task_review_verdict are for every agent.
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
  pi.registerTool(downloadVideo);
  pi.registerTool(listServers);
  pi.registerTool(runCommand);
  pi.registerTool(transcribeAudio);
  pi.registerTool(transcribeFolder);
  pi.registerTool(sendTaskResult);
  pi.registerTool(reviewVerdict);
}
