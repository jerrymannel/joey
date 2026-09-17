import { getDataDb } from "./db.ts";
import { encrypt, decrypt } from "./crypto.ts";

/** An OAuth client (Client ID + Secret) registered in Google Cloud. The same client can be shared across every Google-family integration (Gmail, YouTube, ...) since scopes are requested per auth flow, not baked into the client. */
export interface GoogleApp {
  clientId: string;
  clientSecret: string;
}

export type GmailApp = GoogleApp;
export type YoutubeApp = GoogleApp;

export interface GmailAccount {
  email: string;
  refreshToken: string;
}

export interface YoutubeAccount {
  email: string;
  refreshToken: string;
}

const GMAIL_APP_KEY = "gmail_app";
const GMAIL_ACCOUNTS_KEY = "gmail_accounts";
const YOUTUBE_APP_KEY = "youtube_app";
const YOUTUBE_ACCOUNTS_KEY = "youtube_accounts";
const YOUTUBE_PLAYLIST_ID_KEY = "youtube_playlist_id";
const YOUTUBE_WORKSPACE_FOLDER_KEY = "youtube_workspace_folder";
const SHARED_GOOGLE_APP_KEY = (service: string) => `${service}_uses_gmail_app`;

function getValue(key: string): string | null {
  const row = getDataDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? decrypt(row.value) : null;
}

function setValue(key: string, plaintext: string): void {
  getDataDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, encrypt(plaintext), new Date().toISOString());
}

export function getGmailApp(): GmailApp | null {
  const raw = getValue(GMAIL_APP_KEY);
  return raw ? (JSON.parse(raw) as GmailApp) : null;
}

export function saveGmailApp(app: GmailApp): void {
  setValue(GMAIL_APP_KEY, JSON.stringify(app));
}

export function getGmailAccounts(): GmailAccount[] {
  const raw = getValue(GMAIL_ACCOUNTS_KEY);
  return raw ? (JSON.parse(raw) as GmailAccount[]) : [];
}

/** Upserts by email — reconnecting an already-connected account refreshes its token. */
export function addGmailAccount(account: GmailAccount): void {
  const accounts = getGmailAccounts().filter((a) => a.email !== account.email);
  accounts.push(account);
  setValue(GMAIL_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function removeGmailAccount(email: string): void {
  setValue(GMAIL_ACCOUNTS_KEY, JSON.stringify(getGmailAccounts().filter((a) => a.email !== email)));
}

export function getYoutubeApp(): YoutubeApp | null {
  const raw = getValue(YOUTUBE_APP_KEY);
  return raw ? (JSON.parse(raw) as YoutubeApp) : null;
}

export function saveYoutubeApp(app: YoutubeApp): void {
  setValue(YOUTUBE_APP_KEY, JSON.stringify(app));
}

export function getYoutubeAccounts(): YoutubeAccount[] {
  const raw = getValue(YOUTUBE_ACCOUNTS_KEY);
  return raw ? (JSON.parse(raw) as YoutubeAccount[]) : [];
}

/** Upserts by email — reconnecting an already-connected account refreshes its token. */
export function addYoutubeAccount(account: YoutubeAccount): void {
  const accounts = getYoutubeAccounts().filter((a) => a.email !== account.email);
  accounts.push(account);
  setValue(YOUTUBE_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function removeYoutubeAccount(email: string): void {
  setValue(YOUTUBE_ACCOUNTS_KEY, JSON.stringify(getYoutubeAccounts().filter((a) => a.email !== email)));
}

export function getYoutubePlaylistId(): string | null {
  return getValue(YOUTUBE_PLAYLIST_ID_KEY);
}

export function saveYoutubePlaylistId(playlistId: string): void {
  setValue(YOUTUBE_PLAYLIST_ID_KEY, playlistId);
}

export function getYoutubeWorkspaceFolder(): string | null {
  return getValue(YOUTUBE_WORKSPACE_FOLDER_KEY);
}

export function saveYoutubeWorkspaceFolder(workspaceFolder: string): void {
  setValue(YOUTUBE_WORKSPACE_FOLDER_KEY, workspaceFolder);
}

/** Whether a Google-family service (e.g. "youtube") is set to reuse Gmail's OAuth client instead of its own. */
export function usesGmailApp(service: string): boolean {
  return getValue(SHARED_GOOGLE_APP_KEY(service)) === "true";
}

export function setUsesGmailApp(service: string, value: boolean): void {
  setValue(SHARED_GOOGLE_APP_KEY(service), value ? "true" : "false");
}

export function resolveYoutubeApp(): GoogleApp | null {
  return usesGmailApp("youtube") ? getGmailApp() : getYoutubeApp();
}
