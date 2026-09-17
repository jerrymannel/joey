import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM at-rest encryption for settings values. Key comes from SETTINGS_ENCRYPTION_KEY (64 hex chars / 32 bytes). */
function getKey(): Buffer {
  const hex = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!hex) throw new Error("SETTINGS_ENCRYPTION_KEY env var is required to read or write encrypted settings");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("SETTINGS_ENCRYPTION_KEY must be 32 bytes (64 hex characters)");
  return key;
}

/** Encrypts to a single base64 blob: iv (12) || authTag (16) || ciphertext. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decrypt(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}
