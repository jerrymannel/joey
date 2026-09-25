import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { listTools } from "./tools.ts";
import { requireToolEnabled } from "../../pi-tools/tool-access.ts";

test("every catalog tool is a pi-tools file of that name, registered by index.ts, named after its service; and every tool file is in the catalog", () => {
  const index = readFileSync("pi-tools/index.ts", "utf8");
  for (const tool of listTools()) {
    assert.ok(tool.name.startsWith(`${tool.service}_`), tool.name);
    assert.equal(tool.alwaysOn, tool.service === "task");
    assert.ok(existsSync(`pi-tools/${tool.name}.ts`), `pi-tools/${tool.name}.ts`);
    assert.match(readFileSync(`pi-tools/${tool.name}.ts`, "utf8"), new RegExp(`name: "${tool.name}"`));
    assert.match(index, new RegExp(`"\\./${tool.name}\\.ts"`));
  }
  const files = readdirSync("pi-tools").filter((f) => !["index.ts", "json-result.ts", "tool-access.ts"].includes(f));
  assert.deepEqual(files.map((f) => f.replace(/\.ts$/, "")).sort(), listTools().map((t) => t.name).sort());
  assert.ok(listTools("gmail").every((t) => t.service === "gmail"));
});

test("a tool that reaches anything real refuses unless the agent listed it (JOEY_TOOLS)", () => {
  const before = process.env.JOEY_TOOLS;
  try {
    process.env.JOEY_TOOLS = "ssh_run_command,gmail_read_email";
    assert.doesNotThrow(() => requireToolEnabled("ssh_run_command"));
    assert.throws(() => requireToolEnabled("ssh_list_servers"), /isn't enabled for this agent/);
    delete process.env.JOEY_TOOLS; // outside a task run nothing is enabled
    assert.throws(() => requireToolEnabled("gmail_read_email"), /isn't enabled/);
    // every tool with reach calls the check
    for (const t of listTools().filter((t) => !t.alwaysOn)) assert.match(readFileSync(`pi-tools/${t.name}.ts`, "utf8"), new RegExp(`requireToolEnabled\\("${t.name}"\\)`), t.name);
  } finally {
    if (before === undefined) delete process.env.JOEY_TOOLS;
    else process.env.JOEY_TOOLS = before;
  }
});
