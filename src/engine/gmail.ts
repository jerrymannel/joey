import { addGmailAccount, getGmailApp, getGmailAccounts, type GmailAccount } from "./settings.ts";
import { log } from "./logger.ts";
import { buildGoogleAuthUrl, exchangeGoogleCode, refreshGoogleAccessToken, testGoogleToken, type TokenInfo } from "./google-auth.ts";

const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
// gmail.modify = read, send and relabel — the gmail_* tools and scripts read and label, task_send_result sends.
const SCOPES = ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/userinfo.email"].join(" ");

/** Builds the Google consent-screen URL for the "Connect account" button. */
export function buildGmailAuthUrl(redirectUri: string, state: string): string {
  const app = getGmailApp();
  if (!app) throw new Error("Save a Gmail Client ID and Secret first");
  return buildGoogleAuthUrl(app, redirectUri, SCOPES, state);
}

/** Exchanges an OAuth callback `code` for a refresh token and stores the connected account. */
export async function connectGmailAccount(code: string, redirectUri: string): Promise<GmailAccount> {
  const app = getGmailApp();
  if (!app) throw new Error("Save a Gmail Client ID and Secret first");
  const account = await exchangeGoogleCode(app, code, redirectUri);
  addGmailAccount(account);
  return account;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  labelIds?: string[];
  /** Milliseconds since the epoch, as a string. */
  internalDate?: string;
  payload: { headers: GmailHeader[] } & GmailPart;
}

export interface EmailSummary {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  unread: boolean;
}

export interface EmailDetail extends EmailSummary {
  body: string;
}

/** Picks the requested account, or the first connected one when none is specified. */
function resolveAccount(email?: string): GmailAccount {
  const accounts = getGmailAccounts();
  const account = email ? accounts.find((a) => a.email === email) : accounts[0];
  if (!account) throw new Error("Gmail is not connected — connect an account in Integrations first");
  return account;
}

async function getAccessToken(email?: string): Promise<string> {
  const app = getGmailApp();
  if (!app) throw new Error("Gmail is not configured — set it up in Integrations first");
  const account = resolveAccount(email);
  return refreshGoogleAccessToken(app, account.refreshToken);
}

export type { TokenInfo };

/** Introspects the account's current access token — confirms the OAuth cred + refresh token actually work and shows exactly what scopes were granted. */
export async function testGmailAccount(email?: string): Promise<TokenInfo> {
  return testGoogleToken(await getAccessToken(email));
}

const glog = log("gmail");

async function gmailFetch<T>(path: string, email?: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken(email);
  const method = init?.method ?? "GET";
  const started = Date.now();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const ms = Date.now() - started;
  if (!res.ok) {
    const text = await res.text();
    glog.error({ method, path: path.split("?")[0], status: res.status, ms, account: email }, `Gmail API error: ${text.slice(0, 300)}`);
    throw new Error(`Gmail API error (${res.status}): ${text}`);
  }
  glog.debug({ method, path: path.split("?")[0], status: res.status, ms, account: email }, "Gmail API call");
  return (res.status === 204 ? undefined : await res.json()) as T; // DELETE answers 204 with no body
}

export function headerValue(headers: GmailHeader[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Breadth-first search for the first text/plain part, falling back to text/html. */
export function extractBody(payload: GmailPart): string {
  const queue: GmailPart[] = [payload];
  let htmlFallback: string | undefined;
  while (queue.length) {
    const part = queue.shift()!;
    if (part.mimeType === "text/plain" && part.body?.data) {
      return base64UrlDecode(part.body.data);
    }
    if (part.mimeType === "text/html" && part.body?.data && !htmlFallback) {
      htmlFallback = base64UrlDecode(part.body.data);
    }
    queue.push(...(part.parts ?? []));
  }
  return htmlFallback ?? "";
}

export function base64UrlDecode(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

export function base64UrlEncode(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isUnread(labelIds: string[] | undefined): boolean {
  return (labelIds ?? []).includes("UNREAD");
}

function toSummary(msg: GmailMessage): EmailSummary {
  return {
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet,
    subject: headerValue(msg.payload.headers, "Subject"),
    from: headerValue(msg.payload.headers, "From"),
    date: headerValue(msg.payload.headers, "Date"),
    unread: isUnread(msg.labelIds),
  };
}

/** One page of message ids for `query` (newest first), plus the token for the next page. Lets a caller walk results in batches. */
export async function listMessageIds(query: string, account?: string, pageSize = 10, pageToken?: string): Promise<{ ids: string[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ q: query, maxResults: String(pageSize) });
  if (pageToken) params.set("pageToken", pageToken);
  const list = await gmailFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?${params}`, account);
  return { ids: (list.messages ?? []).map((m) => m.id), nextPageToken: list.nextPageToken };
}

export async function searchEmails(query: string, account?: string, maxResults = 20): Promise<EmailSummary[]> {
  const list = await gmailFetch<{ messages?: { id: string }[] }>(
    `/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    account,
  );
  const messages = await Promise.all(
    (list.messages ?? []).map((m) =>
      gmailFetch<GmailMessage>(
        `/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        account,
      ),
    ),
  );
  return messages.map(toSummary);
}

export async function readEmail(id: string, account?: string): Promise<EmailDetail> {
  const msg = await gmailFetch<GmailMessage>(`/messages/${id}?format=full`, account);
  return { ...toSummary(msg), body: extractBody(msg.payload) };
}

/** Strips CR/LF so user-supplied recipient/subject can't inject extra email headers. */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** A `Name <address>` header value; a non-ASCII name becomes an RFC 2047 encoded-word, otherwise it is quoted. */
export function namedAddress(name: string, address: string): string {
  const n = sanitizeHeaderValue(name);
  if (!n) return address;
  return `${/[^\x20-\x7e]/.test(n) ? `=?UTF-8?B?${Buffer.from(n).toString("base64")}?=` : `"${n.replace(/["\\]/g, "\\$&")}"`} <${address}>`;
}

/** Non-ASCII subjects must be RFC 2047 encoded-words or mail clients show mojibake. */
function headerText(name: string, value: string): string {
  const v = sanitizeHeaderValue(value);
  return name === "Subject" && /[^\x20-\x7e]/.test(v) ? `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=` : v;
}

function buildRaw(headers: Record<string, string>, body: string): string {
  const head = Object.entries(headers).map(([k, v]) => `${k}: ${headerText(k, v)}`);
  return base64UrlEncode(`${head.join("\r\n")}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`);
}

/** Sends a plain-text mail with the given headers (`To`, `Subject`, custom `X-...`); returns the sent message's id. */
export async function sendEmail(headers: Record<string, string>, body: string, account?: string): Promise<string> {
  const result = await gmailFetch<{ id: string }>(`/messages/send`, account, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: buildRaw(headers, body) }),
  });
  return result.id;
}

export async function modifyLabels(id: string, add: string[], remove: string[], account?: string): Promise<void> {
  await gmailFetch(`/messages/${id}/modify`, account, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
}

export interface GmailLabel {
  id: string;
  name: string;
  /** `system` (INBOX, UNREAD, …) or `user`. */
  type: string;
}

export async function listLabels(account?: string): Promise<GmailLabel[]> {
  return (await gmailFetch<{ labels?: GmailLabel[] }>(`/labels`, account)).labels ?? [];
}

/** Gmail label names are one line, and "/" would nest the label under another. */
export function labelName(name: string): string {
  return sanitizeHeaderValue(name).replace(/\//g, "-");
}

const sameLabel = (a: string, b: string) => labelName(a).toLowerCase() === b.toLowerCase(); // Gmail treats names case-insensitively

/** Ids for the named labels, creating the ones that don't exist yet. System labels (INBOX, UNREAD…) match by name. */
export async function ensureLabels(names: string[], account?: string): Promise<string[]> {
  if (!names.some(labelName)) return [];
  const existing = await listLabels(account);
  const ids: string[] = [];
  for (const name of names.filter((n) => labelName(n))) {
    let label = existing.find((l) => sameLabel(name, l.name));
    if (!label) {
      label = await gmailFetch<GmailLabel>(`/labels`, account, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: labelName(name), labelListVisibility: "labelShow", messageListVisibility: "show" }),
      });
      existing.push(label);
      glog.info({ label: label.name }, "label created");
    }
    ids.push(label.id);
  }
  return ids;
}

/** Deletes a user label (mail keeps existing, just loses the label); returns false when there's no such label. System labels can't be deleted. */
export async function deleteLabel(name: string, account?: string): Promise<boolean> {
  const label = (await listLabels(account)).find((l) => sameLabel(name, l.name));
  if (!label) return false;
  if (label.type !== "user") throw new Error(`"${label.name}" is a system label and can't be deleted`);
  await gmailFetch(`/labels/${label.id}`, account, { method: "DELETE" });
  return true;
}

/** Adds (creating any that are missing) and removes labels by name on one message. Removing a label that doesn't exist is a no-op. */
export async function labelEmail(id: string, add: string[], remove: string[], account?: string): Promise<void> {
  const existing = await listLabels(account);
  const removeIds = existing.filter((l) => remove.some((n) => sameLabel(n, l.name))).map((l) => l.id);
  await modifyLabels(id, await ensureLabels(add, account), removeIds, account);
}
