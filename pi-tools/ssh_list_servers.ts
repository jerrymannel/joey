import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { listSshConfigs } from "../src/engine/ssh.ts";
import { jsonResult } from "./json-result.ts";

export default defineTool({
  name: "ssh_list_servers",
  label: "List SSH Servers",
  description: "List the configured SSH servers by name, with their IP, username and auth method (secrets are never shown). Use the name with ssh_run_command.",
  promptSnippet: "ssh_list_servers: list the SSH servers you can run commands on",
  parameters: Type.Object({}),
  async execute() {
    return jsonResult(listSshConfigs().map(({ name, host, username, authMethod }) => ({ name, host, username, authMethod })));
  },
});
