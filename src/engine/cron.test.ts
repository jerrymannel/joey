import { test } from "node:test";
import assert from "node:assert/strict";
import { cronMatches } from "./cron.ts";

test("cronMatches supports *, lists, ranges, and steps", () => {
  const date = new Date(2026, 0, 15, 9, 30); // Thu Jan 15 2026, 09:30

  assert.equal(cronMatches("* * * * *", date), true);
  assert.equal(cronMatches("30 9 * * *", date), true);
  assert.equal(cronMatches("31 9 * * *", date), false);
  assert.equal(cronMatches("0,30 * * * *", date), true);
  assert.equal(cronMatches("*/15 * * * *", date), true);
  assert.equal(cronMatches("*/20 * * * *", date), false);
  assert.equal(cronMatches("* 8-10 * * *", date), true);
  assert.equal(cronMatches("* 10-11 * * *", date), false);
  assert.equal(cronMatches("* * * * 4", date), true); // Thursday
  assert.equal(cronMatches("* * * * 1", date), false);
});

test("cronMatches rejects malformed expressions", () => {
  assert.equal(cronMatches("not a cron expr", new Date()), false);
});

test("cronIsValid accepts what cronMatches understands and nothing else", async () => {
  const { cronIsValid } = await import("./cron.ts");
  for (const ok of ["* * * * *", "0 8 * * 1-5", "*/15 0,12 1 1-6/2 *"]) assert.ok(cronIsValid(ok), ok);
  for (const bad of ["every day", "* * * *", "0 8 * * MON", "*/ * * * *", "1-2-3 * * * *"]) assert.ok(!cronIsValid(bad), bad);
});
