import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

test("encrypt/decrypt round-trips and fails without a key", async () => {
  delete process.env.SETTINGS_ENCRYPTION_KEY;
  const { encrypt, decrypt } = await import(`./crypto.ts?t=${Date.now()}`);

  assert.throws(() => encrypt("secret"));

  process.env.SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const blob = encrypt("hello gmail");
  assert.notEqual(blob, "hello gmail");
  assert.equal(decrypt(blob), "hello gmail");
});
