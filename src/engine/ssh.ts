import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSettingsDb } from "./db.ts";
import { decrypt, encrypt } from "./crypto.ts";
import * as herdr from "./herdr.ts";
import { log } from "./logger.ts";

const slog = log("ssh");

export const SSH_AUTH_METHODS = ["password", "identity"] as const;
export type SshAuthMethod = (typeof SSH_AUTH_METHODS)[number];

/** A remote server the `ssh_*` tools can log in to. The password / private key is stored encrypted (crypto.ts) and never leaves this module. */
export interface SshConfig {
  id: string;
  name: string;
  host: string;
  username: string;
  authMethod: SshAuthMethod;
  createdAt: string;
}

/** `secret` is the password (authMethod "password") or the private key file's content ("identity"); optional on update, meaning keep the stored one. */
export interface SshInput {
  name: string;
  host: string;
  username: string;
  authMethod: SshAuthMethod;
  secret?: string;
}

interface SshRow {
  id: string;
  name: string;
  host: string;
  username: string;
  auth_method: string;
  secret: string;
  created_at: string;
}

function fromRow(row: SshRow): SshConfig {
  return { id: row.id, name: row.name, host: row.host, username: row.username, authMethod: row.auth_method as SshAuthMethod, createdAt: row.created_at };
}

export function listSshConfigs(): SshConfig[] {
  return (getSettingsDb().prepare("SELECT * FROM ssh_configs ORDER BY created_at ASC").all() as SshRow[]).map(fromRow);
}

export function getSshConfig(id: string): SshConfig | undefined {
  const row = getSettingsDb().prepare("SELECT * FROM ssh_configs WHERE id = ?").get(id) as SshRow | undefined;
  return row && fromRow(row);
}

const rowByName = (name: string) =>
  (getSettingsDb().prepare("SELECT * FROM ssh_configs").all() as SshRow[]).find((r) => r.name.toLowerCase() === name.trim().toLowerCase());

/** Checks and normalises an input; a leading "-" in host/username would be read by ssh as an option, hence the strict patterns. */
function checked(input: SshInput, existing?: SshRow): { input: SshInput; secret: string } {
  const name = input.name.trim();
  const host = input.host.trim();
  const username = input.username.trim();
  if (!name) throw new Error("name is required");
  if (!/^[A-Za-z0-9._:-]+$/.test(host) || host.startsWith("-")) throw new Error("IP / host must be an IP address or host name");
  if (!/^[A-Za-z0-9._][A-Za-z0-9._-]*$/.test(username)) throw new Error("username has characters ssh logins don't use");
  if (!SSH_AUTH_METHODS.includes(input.authMethod)) throw new Error(`auth method must be one of ${SSH_AUTH_METHODS.join(", ")}`);
  const clash = rowByName(name);
  if (clash && clash.id !== existing?.id) throw new Error(`an SSH configuration named "${name}" already exists`);

  let secret = input.secret ?? "";
  if (input.authMethod === "identity" && secret) {
    secret = `${secret.replace(/\r\n/g, "\n").trim()}\n`; // ssh rejects a key file with no trailing newline
    if (!secret.startsWith("-----BEGIN ")) throw new Error("the key file content must be a private key (starting with -----BEGIN …)");
  }
  if (!secret) {
    if (!existing || existing.auth_method !== input.authMethod) throw new Error(input.authMethod === "password" ? "password is required" : "key file content is required");
    secret = decrypt(existing.secret); // unchanged
  }
  return { input: { name, host, username, authMethod: input.authMethod }, secret };
}

export function createSshConfig(raw: SshInput): SshConfig {
  const { input, secret } = checked(raw);
  const id = randomUUID();
  getSettingsDb()
    .prepare("INSERT INTO ssh_configs (id, name, host, username, auth_method, secret, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, input.name, input.host, input.username, input.authMethod, encrypt(secret), new Date().toISOString());
  return getSshConfig(id)!;
}

export function updateSshConfig(id: string, raw: SshInput): SshConfig | undefined {
  const existing = getSettingsDb().prepare("SELECT * FROM ssh_configs WHERE id = ?").get(id) as SshRow | undefined;
  if (!existing) return undefined;
  const { input, secret } = checked(raw, existing);
  getSettingsDb()
    .prepare("UPDATE ssh_configs SET name = ?, host = ?, username = ?, auth_method = ?, secret = ? WHERE id = ?")
    .run(input.name, input.host, input.username, input.authMethod, encrypt(secret), id);
  return getSshConfig(id);
}

export function deleteSshConfig(id: string): void {
  getSettingsDb().prepare("DELETE FROM ssh_configs WHERE id = ?").run(id);
}

export interface SshResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Runs one command on a configured server with the system `ssh` (override the binary with JOEY_SSH_BIN) and waits for it, in a herdr tab like every command Joey
 * runs. No ssh library, no `sshpass`: a password is handed over through SSH_ASKPASS (a throwaway script that prints a 0600 temp file — never the command line, which
 * herdr shows and keeps), a private key through a 0600 temp file; both are deleted afterwards. stdout/stderr go to temp files (read back here) rather than the pane.
 * Unknown host keys are trusted on first use (`accept-new`) and checked afterwards; the user's own ssh config is ignored.
 */
export async function runSshCommand(name: string, command: string, timeoutSec = 60): Promise<SshResult> {
  const row = rowByName(name);
  if (!row) {
    const names = listSshConfigs().map((c) => c.name);
    throw new Error(`no SSH configuration named "${name}"${names.length ? ` — available: ${names.join(", ")}` : " (none are configured)"}`);
  }
  const secret = decrypt(row.secret);
  const dir = mkdtempSync(join(tmpdir(), "joey-ssh-"));
  const env: string[] = [];
  const args = ["-F", "/dev/null", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10", "-o", "NumberOfPasswordPrompts=1", "-l", row.username];
  if (row.auth_method === "identity") {
    const keyFile = join(dir, "key");
    writeFileSync(keyFile, secret, { mode: 0o600 });
    args.push("-i", keyFile, "-o", "IdentitiesOnly=yes", "-o", "PreferredAuthentications=publickey", "-o", "BatchMode=yes");
  } else {
    const passwordFile = join(dir, "password");
    const askpass = join(dir, "askpass.sh");
    writeFileSync(passwordFile, `${secret}\n`, { mode: 0o600 });
    writeFileSync(askpass, `#!/bin/sh\ncat ${herdr.shellQuote(passwordFile)}\n`, { mode: 0o700 });
    env.push(`SSH_ASKPASS=${herdr.shellQuote(askpass)}`, "SSH_ASKPASS_REQUIRE=force");
    args.push("-o", "PreferredAuthentications=password,keyboard-interactive", "-o", "PubkeyAuthentication=no");
  }
  args.push("--", row.host, command);
  const [stdoutFile, stderrFile] = [join(dir, "stdout"), join(dir, "stderr")];
  const line = [...env, herdr.shellQuote(process.env.JOEY_SSH_BIN ?? "ssh"), ...args.map(herdr.shellQuote), "< /dev/null", `> ${herdr.shellQuote(stdoutFile)}`, `2> ${herdr.shellQuote(stderrFile)}`].join(" ");
  slog.debug({ server: row.name, host: row.host, user: row.username, auth: row.auth_method }, "ssh command");
  try {
    const { exitCode, timedOut } = await herdr.runInTab(dir, `ssh:${row.name}`, line, timeoutSec * 1000);
    const read = (file: string) => (existsSync(file) ? readFileSync(/* turbopackIgnore: true */ file, "utf8") : "");
    return { exitCode, stdout: read(stdoutFile), stderr: read(stderrFile), timedOut };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
