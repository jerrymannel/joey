import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A fresh logger (it reads its env once, at import) writing only to a temp file. */
async function freshLogger(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "joey-logger-test-"));
  const file = join(dir, "sub", "joey.log");
  Object.assign(process.env, { LOG_CONSOLE: "off", LOG_FILE: file, ...env });
  const mod = await import(`./logger.ts?t=${Date.now()}-${Math.random()}`);
  const lines = () => readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { ...mod, lines, done: () => { for (const k of ["LOG_CONSOLE", "LOG_FILE", "LOG_LEVEL", "LOG_FILE_LEVEL"]) delete process.env[k]; rmSync(dir, { recursive: true }); } };
}

test("the file sink gets JSON lines from `debug` up by default, tagged with the module; trace is dropped", async () => {
  const l = await freshLogger({ LOG_LEVEL: "warn" }); // console level doesn't limit the file
  l.log("mailbox").trace("too fine");
  l.log("mailbox").debug({ id: "m1" }, "scanned");
  l.log("run").error({ runId: "r1", err: l.errMsg(new Error("boom")) }, "run failed");
  const lines = l.lines();
  assert.deepEqual(lines.map((x: any) => [x.level, x.mod, x.msg]), [[20, "mailbox", "scanned"], [50, "run", "run failed"]]);
  assert.equal(lines[1].err, "boom");
  assert.equal(lines[1].runId, "r1");
  l.done();
});

test("LOG_FILE_LEVEL raises or lowers what reaches the file", async () => {
  const l = await freshLogger({ LOG_LEVEL: "warn", LOG_FILE_LEVEL: "warn" });
  l.log("x").info("noise");
  l.log("x").warn("look");
  assert.deepEqual(l.lines().map((x: any) => x.msg), ["look"]);
  l.done();

  const t = await freshLogger({ LOG_LEVEL: "trace", LOG_FILE_LEVEL: "trace" });
  t.log("x").trace("fine");
  assert.deepEqual(t.lines().map((x: any) => x.msg), ["fine"]);
  t.done();
});

test("errMsg reads Errors and anything else", async () => {
  const l = await freshLogger({ LOG_LEVEL: "warn" });
  assert.equal(l.errMsg(new Error("a")), "a");
  assert.equal(l.errMsg("b"), "b");
  l.done();
});
