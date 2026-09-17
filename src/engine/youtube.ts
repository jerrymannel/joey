import { addYoutubeAccount, resolveYoutubeApp, getYoutubeAccounts, type YoutubeAccount } from "./settings.ts";
import { buildGoogleAuthUrl, exchangeGoogleCode, refreshGoogleAccessToken, testGoogleToken, type TokenInfo } from "./google-auth.ts";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

/** Builds the Google consent-screen URL for the "Connect account" button. */
export function buildYoutubeAuthUrl(redirectUri: string, state: string): string {
  const app = resolveYoutubeApp();
  if (!app) throw new Error("Save a YouTube Client ID and Secret (or enable 'use Gmail's OAuth client') first");
  return buildGoogleAuthUrl(app, redirectUri, SCOPES, state);
}

/** Exchanges an OAuth callback `code` for a refresh token and stores the connected account. */
export async function connectYoutubeAccount(code: string, redirectUri: string): Promise<YoutubeAccount> {
  const app = resolveYoutubeApp();
  if (!app) throw new Error("Save a YouTube Client ID and Secret (or enable 'use Gmail's OAuth client') first");
  const account = await exchangeGoogleCode(app, code, redirectUri);
  addYoutubeAccount(account);
  return account;
}

/** Picks the requested account, or the first connected one when none is specified. */
function resolveAccount(email?: string): YoutubeAccount {
  const accounts = getYoutubeAccounts();
  const account = email ? accounts.find((a) => a.email === email) : accounts[0];
  if (!account) throw new Error("YouTube is not connected — connect an account in Integrations first");
  return account;
}

async function getAccessToken(email?: string): Promise<string> {
  const app = resolveYoutubeApp();
  if (!app) throw new Error("YouTube is not configured — set it up in Integrations first");
  const account = resolveAccount(email);
  return refreshGoogleAccessToken(app, account.refreshToken);
}

export type { TokenInfo };

/** Introspects the account's current access token — confirms the OAuth cred + refresh token actually work and shows exactly what scopes were granted. */
export async function testYoutubeAccount(email?: string): Promise<TokenInfo> {
  return testGoogleToken(await getAccessToken(email));
}

async function youtubeFetch<T>(path: string, email?: string): Promise<T> {
  const token = await getAccessToken(email);
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`YouTube API error (${res.status}): ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface PlaylistVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
}

interface PlaylistItemsResponse {
  items: {
    snippet: {
      title: string;
      channelTitle: string;
      publishedAt: string;
      thumbnails: { medium?: { url: string }; default?: { url: string } };
      resourceId: { videoId: string };
    };
  }[];
  nextPageToken?: string;
}

/** Fetches every video in a playlist, following pagination. */
export async function fetchPlaylistVideos(playlistId: string, email?: string): Promise<PlaylistVideo[]> {
  const videos: PlaylistVideo[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ part: "snippet", playlistId, maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await youtubeFetch<PlaylistItemsResponse>(`/playlistItems?${params}`, email);
    for (const item of page.items) {
      videos.push({
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnailUrl: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? "",
        publishedAt: item.snippet.publishedAt,
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return videos;
}

export interface PlaylistSummary {
  id: string;
  title: string;
}

interface PlaylistsResponse {
  items: { id: string; snippet: { title: string } }[];
  nextPageToken?: string;
}

/** Lists the connected account's own playlists, following pagination. */
export async function fetchMyPlaylists(email?: string): Promise<PlaylistSummary[]> {
  const playlists: PlaylistSummary[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ part: "snippet", mine: "true", maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await youtubeFetch<PlaylistsResponse>(`/playlists?${params}`, email);
    for (const item of page.items) {
      playlists.push({ id: item.id, title: item.snippet.title });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return playlists;
}
