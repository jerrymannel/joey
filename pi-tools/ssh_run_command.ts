import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { runSshCommand } from "../src/engine/ssh.ts";
import { errMsg, log } from "../src/engine/logger.ts";
import { jsonResult } from "./json-result.ts";
import { requireToolEnabled } from "./tool-access.ts";

export default defineTool({
  name: "ssh_run_command",
  label: "Run SSH Command",
  description:
    "Run one shell command on a configured SSH server (find names with ssh_list_servers) and wait for it. Returns stdout, stderr and the exit code. Non-interactive: a command that waits for input will hang until the timeout. One command at a time; chain with && or ; if you need several.",
  promptSnippet: "ssh_run_command: run a shell command on a configured SSH server",
  parameters: Type.Object({
    server: Type.String({ description: "SSH configuration name, from ssh_list_servers" }),
    command: Type.String({ description: "Shell command to run" }),
    timeoutSeconds: Type.Optional(Type.Number({ description: "Give up after this many seconds (default 60)" })),
  }),
  async execute(_toolCallId, params) {
    requireToolEnabled("ssh_run_command");
    try {
      return jsonResult(await runSshCommand(params.server, params.command, params.timeoutSeconds));
    } catch (err) {
      log("ssh_run_command").error({ server: params.server, task: process.env.TASK_ID, run: process.env.RUN_ID, err: errMsg(err) }, "ssh_run_command failed");
      throw err;
    }
  },
});
