import { after, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createSshConfig, deleteSshConfig, listSshConfigs, runSshCommand, updateSshConfig } from "./ssh.ts";
import { getDataDb } from "./db.ts";
import { decrypt } from "./crypto.ts";
import { taskHasTool, listTools } from "./tools.ts";

const root = mkdtempSync(join(tmpdir(), "joey-ssh-test-"));
process.env.SETTINGS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");
process.env.DATA_DB_PATH = join(root, "data.db");
after(() => rmSync(root, { recursive: true }));

const KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----";
const stored = (name: string) => (getDataDb().prepare("SELECT secret FROM ssh_configs WHERE name = ?").get(name) as { secret: string }).secret;

test("ssh configs: the secret is stored encrypted and never comes back; blank keeps it, a new auth method needs a new one", () => {
  const pw = createSshConfig({ name: "web", host: "203.0.113.10", username: "deploy", authMethod: "password", secret: "hunter2" });
  assert.deepEqual(Object.keys(pw).sort(), ["authMethod", "createdAt", "host", "id", "name", "username"]);
  assert.doesNotMatch(stored("web"), /hunter2/);

  updateSshConfig(pw.id, { name: "web", host: "203.0.113.11", username: "deploy", authMethod: "password" }); // blank secret: unchanged
  assert.equal(listSshConfigs()[0].host, "203.0.113.11");
  assert.throws(() => updateSshConfig(pw.id, { name: "web", host: "h", username: "u", authMethod: "identity" }), /key file content is required/);
  assert.equal(decrypt(stored("web")), "hunter2"); // still the original

  const key = createSshConfig({ name: "db", host: "db.example.com", username: "root", authMethod: "identity", secret: KEY });
  assert.doesNotMatch(stored("db"), /BEGIN/);
  deleteSshConfig(key.id);
  deleteSshConfig(pw.id);
  assert.deepEqual(listSshConfigs(), []);
});

test("ssh configs reject what ssh would read as an option, duplicate names, and non-keys", () => {
  const ok = { name: "n", host: "h.example.com", username: "u", authMethod: "password" as const, secret: "x" };
  assert.throws(() => createSshConfig({ ...ok, host: "-oProxyCommand=evil" }), /IP \/ host/);
  assert.throws(() => createSshConfig({ ...ok, username: "-x" }), /username/);
  assert.throws(() => createSshConfig({ ...ok, host: "a b" }), /IP \/ host/);
  assert.throws(() => createSshConfig({ ...ok, secret: "" }), /password is required/);
  assert.throws(() => createSshConfig({ ...ok, authMethod: "identity", secret: "not a key" }), /private key/);
  const first = createSshConfig(ok);
  assert.throws(() => createSshConfig({ ...ok, name: "N" }), /already exists/); // case-insensitive
  deleteSshConfig(first.id);
});

test("runSshCommand hands a password over via SSH_ASKPASS and a key via a temp file that is removed afterwards", async () => {
  // A stand-in for `ssh`: prints its args, the askpass answer, and the key file's content.
  const fake = join(root, "fake-ssh.sh");
  writeFileSync(fake, `#!/bin/sh\necho "ARGS: $@"\n[ -n "$SSH_ASKPASS" ] && echo "ASKPASS: $("$SSH_ASKPASS" prompt)"\nwhile [ $# -gt 0 ]; do [ "$1" = "-i" ] && { echo "KEY: $(cat "$2")"; echo "KEYFILE: $2"; }; shift; done\necho oops >&2\nexit 3\n`);
  chmodSync(fake, 0o755);
  process.env.JOEY_SSH_BIN = fake;
  createSshConfig({ name: "pw", host: "10.0.0.1", username: "deploy", authMethod: "password", secret: "hunter2" });
  createSshConfig({ name: "id", host: "10.0.0.2", username: "root", authMethod: "identity", secret: KEY });
  try {
    const a = await runSshCommand("PW", "uptime && ls");
    assert.deepEqual([a.exitCode, a.timedOut, a.stderr.trim()], [3, false, "oops"]);
    assert.match(a.stdout, /ARGS: .*-l deploy .*-- 10\.0\.0\.1 uptime && ls/);
    assert.match(a.stdout, /ASKPASS: hunter2/);
    assert.doesNotMatch(a.stdout, /-i /);

    const b = await runSshCommand("id", "id");
    assert.match(b.stdout, /KEY: -----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----/);
    assert.equal(existsSync(/KEYFILE: (.+)/.exec(b.stdout)![1]), false);

    await assert.rejects(runSshCommand("nope", "x"), /no SSH configuration named "nope" — available: pw, id/);
  } finally {
    delete process.env.JOEY_SSH_BIN;
  }
});

test("runSshCommand kills a command that outlives its timeout", async () => {
  const slow = join(root, "slow-ssh.sh");
  writeFileSync(slow, "#!/bin/sh\nsleep 5\n");
  chmodSync(slow, 0o755);
  process.env.JOEY_SSH_BIN = slow;
  try {
    const r = await runSshCommand("pw", "x", 0.2);
    assert.deepEqual([r.timedOut, r.exitCode], [true, null]);
  } finally {
    delete process.env.JOEY_SSH_BIN;
  }
});

test("taskHasTool: the ssh tools are granted per task", () => {
  const run = listTools().find((t) => t.name === "ssh_run_command")!;
  assert.equal(taskHasTool([run.id], "ssh_run_command"), true);
  assert.equal(taskHasTool([run.id], "ssh_list_servers"), false);
  assert.equal(taskHasTool([], "ssh_run_command"), false);
  assert.equal(taskHasTool([], "mailbox_send_result"), true); // always on
});
