import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDataDb } from "./db.ts";
import { decrypt, encrypt } from "./crypto.ts";
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
  return (getDataDb().prepare("SELECT * FROM ssh_configs ORDER BY created_at ASC").all() as SshRow[]).map(fromRow);
}

export function getSshConfig(id: string): SshConfig | undefined {
  const row = getDataDb().prepare("SELECT * FROM ssh_configs WHERE id = ?").get(id) as SshRow | undefined;
  return row && fromRow(row);
}

const rowByName = (name: string) =>
  (getDataDb().prepare("SELECT * FROM ssh_configs").all() as SshRow[]).find((r) => r.name.toLowerCase() === name.trim().toLowerCase());

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
  getDataDb()
    .prepare("INSERT INTO ssh_configs (id, name, host, username, auth_method, secret, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, input.name, input.host, input.username, input.authMethod, encrypt(secret), new Date().toISOString());
  return getSshConfig(id)!;
}

export function updateSshConfig(id: string, raw: SshInput): SshConfig | undefined {
  const existing = getDataDb().prepare("SELECT * FROM ssh_configs WHERE id = ?").get(id) as SshRow | undefined;
  if (!existing) return undefined;
  const { input, secret } = checked(raw, existing);
  getDataDb()
    .prepare("UPDATE ssh_configs SET name = ?, host = ?, username = ?, auth_method = ?, secret = ? WHERE id = ?")
    .run(input.name, input.host, input.username, input.authMethod, encrypt(secret), id);
  return getSshConfig(id);
}

export function deleteSshConfig(id: string): void {
  getDataDb().prepare("DELETE FROM ssh_configs WHERE id = ?").run(id);
}

export interface SshResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Runs one command on a configured server with the system `ssh` (override the binary with JOEY_SSH_BIN) and waits for it. No ssh library, no `sshpass`:
 * a password is handed over through SSH_ASKPASS (a throwaway script that echoes an env var, so it never sits on disk), a private key through a 0600 temp file
 * that is deleted afterwards. Unknown host keys are trusted on first use (`accept-new`) and checked afterwards; the user's own ssh config is ignored.
 */
export async function runSshCommand(name: string, command: string, timeoutSec = 60): Promise<SshResult> {
  const row = rowByName(name);
  if (!row) {
    const names = listSshConfigs().map((c) => c.name);
    throw new Error(`no SSH configuration named "${name}"${names.length ? ` — available: ${names.join(", ")}` : " (none are configured)"}`);
  }
  const secret = decrypt(row.secret);
  const dir = mkdtempSync(join(tmpdir(), "joey-ssh-"));
  const env: NodeJS.ProcessEnv = { ...process.env };
  const args = ["-F", "/dev/null", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10", "-o", "NumberOfPasswordPrompts=1", "-l", row.username];
  if (row.auth_method === "identity") {
    const keyFile = join(dir, "key");
    writeFileSync(keyFile, secret, { mode: 0o600 });
    args.push("-i", keyFile, "-o", "IdentitiesOnly=yes", "-o", "PreferredAuthentications=publickey", "-o", "BatchMode=yes");
  } else {
    const askpass = join(dir, "askpass.sh");
    writeFileSync(askpass, '#!/bin/sh\nprintf \'%s\\n\' "$JOEY_SSH_PASSWORD"\n', { mode: 0o700 });
    Object.assign(env, { SSH_ASKPASS: askpass, SSH_ASKPASS_REQUIRE: "force", JOEY_SSH_PASSWORD: secret });
    args.push("-o", "PreferredAuthentications=password,keyboard-interactive", "-o", "PubkeyAuthentication=no");
  }
  args.push("--", row.host, command);
  slog.debug({ server: row.name, host: row.host, user: row.username, auth: row.auth_method }, "ssh command");
  try {
    return await new Promise<SshResult>((resolve) => {
      const child = execFile(/* turbopackIgnore: true */ process.env.JOEY_SSH_BIN ?? "ssh", args, { env, timeout: timeoutSec * 1000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        const e = err as (Error & { code?: number | string; killed?: boolean }) | null;
        resolve({ exitCode: e ? (typeof e.code === "number" ? e.code : null) : 0, stdout, stderr: e && typeof e.code !== "number" && !e.killed ? `${stderr}${e.message}` : stderr, timedOut: !!e?.killed });
      });
      child.stdin?.end();
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
