import { addGmailAccount, getGmailApp, getGmailAccounts, type GmailAccount } from "./settings.ts";
import { buildGoogleAuthUrl, exchangeGoogleCode, refreshGoogleAccessToken, testGoogleToken, type TokenInfo } from "./google-auth.ts";

const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

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

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: { headers: GmailHeader[] } & GmailPart;
}

export interface EmailSummary {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
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

async function gmailFetch<T>(path: string, email?: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken(email);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!res.ok) throw new Error(`Gmail API error (${res.status}): ${await res.text()}`);
  return res.json() as Promise<T>;
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

function toSummary(msg: GmailMessage): EmailSummary {
  return {
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet,
    subject: headerValue(msg.payload.headers, "Subject"),
    from: headerValue(msg.payload.headers, "From"),
    date: headerValue(msg.payload.headers, "Date"),
  };
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

export async function createDraft(
  to: string,
  subject: string,
  body: string,
  account?: string,
): Promise<{ id: string }> {
  const raw = base64UrlEncode(
    `To: ${sanitizeHeaderValue(to)}\r\n` +
      `Subject: ${sanitizeHeaderValue(subject)}\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`,
  );
  const result = await gmailFetch<{ id: string }>(`/drafts`, account, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
  });
  return { id: result.id };
}
