import type { GoogleApp } from "./settings.ts";

/**
 * Generic Google OAuth (authorization-code + refresh-token) flow, shared by every
 * Google-family integration (Gmail, YouTube, ...). Each integration still registers its
 * own callback route (`/api/settings/<service>/callback`) — see AGENTS.md — because that
 * path is what gets added as an Authorized redirect URI in Google Cloud, but the token
 * exchange/refresh/introspection mechanics underneath are identical, so they live here once.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export interface GoogleAccountTokens {
  email: string;
  refreshToken: string;
}

export interface TokenInfo {
  scopes: string[];
  expiresIn: number;
}

/** Builds the Google consent-screen URL for a "Connect account" button. */
export function buildGoogleAuthUrl(app: GoogleApp, redirectUri: string, scope: string, state: string): string {
  const params = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope,
    state,
  });
  return `${AUTH_URL}?${params}`;
}

/** Exchanges an OAuth callback `code` for a refresh token and the account's email. */
export async function exchangeGoogleCode(app: GoogleApp, code: string, redirectUri: string): Promise<GoogleAccountTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; refresh_token?: string };
  if (!data.refresh_token) {
    throw new Error(
      "Google didn't return a refresh token (already granted). Revoke access at " +
        "https://myaccount.google.com/permissions and connect again.",
    );
  }
  const profileRes = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${data.access_token}` } });
  if (!profileRes.ok) throw new Error(`Google userinfo lookup failed (${profileRes.status})`);
  const { email } = (await profileRes.json()) as { email: string };
  return { email, refreshToken: data.refresh_token };
}

/** Exchanges a stored refresh token for a fresh access token. */
export async function refreshGoogleAccessToken(app: GoogleApp, refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** Introspects an access token — shows exactly which scopes were granted and how long it's valid for. */
export async function testGoogleToken(accessToken: string): Promise<TokenInfo> {
  const res = await fetch(`${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) throw new Error(`Token check failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { scope?: string; expires_in?: string };
  return { scopes: data.scope ? data.scope.split(" ") : [], expiresIn: Number(data.expires_in ?? 0) };
}
