import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { listTools } from "./tools.ts";

test("every catalog tool is a pi-tools file of that name, registered by index.ts, named after its service; and every tool file is in the catalog", () => {
  const index = readFileSync("pi-tools/index.ts", "utf8");
  for (const tool of listTools()) {
    assert.ok(tool.name.startsWith(`${tool.service}_`), tool.name);
    assert.ok(existsSync(`pi-tools/${tool.name}.ts`), `pi-tools/${tool.name}.ts`);
    assert.match(readFileSync(`pi-tools/${tool.name}.ts`, "utf8"), new RegExp(`name: "${tool.name}"`));
    assert.match(index, new RegExp(`"\\./${tool.name}\\.ts"`));
  }
  const files = readdirSync("pi-tools").filter((f) => !["index.ts", "json-result.ts", "conversation.ts"].includes(f));
  assert.deepEqual(files.map((f) => f.replace(/\.ts$/, "")).sort(), listTools().map((t) => t.name).sort());
  assert.ok(listTools("gmail").every((t) => t.service === "gmail"));
});
