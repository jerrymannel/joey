# Joey — Build Guide

TypeScript/Next.js control panel for simple, schedulable agent tasks. Each
task has a prompt, a harness (which CLI runs it), optional CLI params, and a
model — and can be started manually or on a cron schedule. Every run is
logged so its output can be read back later.

## Commands

```bash
npm install
npm run dev         # next dev, http://localhost:3000
npm run build       # next build — must stay clean (no errors; warnings ok)
npm run typecheck   # tsc --noEmit
npm test            # node's built-in test runner via tsx, src/**/*.test.ts
npm run start-run -- <taskId>   # CLI equivalent of "Start Run"
```

Run `typecheck` + `build` + `test` after any change.

## Layout

- `app/` — Next.js App Router. `app/api/**/route.ts` are the HTTP API (still
  under `app/api/settings/**` for historical reasons — not renamed with the
  UI, since that would break any already-registered OAuth redirect URIs).
  `app/tasks/**/page.tsx` are the task UI pages; `app/gmail`/`app/youtube`
  are the per-service pages. `app/integrations` is a provider list — a
  side panel (`app/integrations/layout.tsx`, currently just "Google", add
  an entry to its `PROVIDERS` array when a non-Google provider shows up)
  next to whichever provider's page is open. `app/integrations/google`
  holds the Google OAuth client setup (Client ID/Secret) and, below it,
  one card per connectable service (Gmail, YouTube) with connect/disconnect
  and a "Test" button that shows which scopes/services a connected account
  actually has access to. The sidebar groups all of these under a
  "Settings" heading.
  `app/components/*.tsx` are shared client components. `app/lib/types.ts`
  duplicates (deliberately — see its own comment) the client-facing shapes
  of `src/engine`'s types so nothing server-only (`better-sqlite3`) risks
  reaching the client bundle.
- `src/engine/*.ts` — plain TS, no Next.js dependency.
  - `db.ts` — SQLite handles + migrations for `data/data.db` (tasks,
    settings) and `data/logs.db` (runs).
  - `task-board.ts` — CRUD for tasks (name, folder, prompt, harness, CLI
    params, model, schedule).
  - `run-log.ts` — CRUD for runs (status, accumulated output log).
  - `harness.ts` — spawns the task's harness CLI (`pi`/`claude`/`agy`;
    `adk` is a listed-but-unimplemented TypeScript harness) with the task's
    prompt/model/CLI params, streaming stdout+stderr into the run's log.
  - `cron.ts` / `scheduler.ts` — minutely 5-field cron matching against
    each task's `schedule`; `instrumentation.ts` ticks it every 30s.
  - `google-auth.ts` — the generic Google OAuth handler (auth-URL building,
    code-for-refresh-token exchange, access-token refresh, `tokeninfo`
    introspection) shared by every Google-family integration; `gmail.ts`
    and `youtube.ts` each just supply their own scopes and `GoogleApp`.
  - `crypto.ts`, `gmail.ts`, `settings.ts` — the Gmail integration (OAuth,
    search/read/draft — never sends mail). `settings.ts` also holds the
    generic `GoogleApp` (Client ID/Secret) storage shared by every
    Google-family integration, plus `usesGmailApp(service)` /
    `resolveYoutubeApp()` for opting a service into reusing Gmail's OAuth
    client instead of registering its own — one Google Cloud OAuth client
    can serve Gmail, YouTube, and future Google integrations alike, since
    scopes are requested per auth flow, not baked into the client.
    `testGmailAccount(email)` hits Google's `tokeninfo` endpoint to show
    exactly which scopes a connected account's token actually carries —
    the "Test" button next to each account on Integrations.
  - `youtube.ts` — YouTube integration (OAuth, `playlistItems.list` against
    a playlist ID from Integrations, `fetchMyPlaylists` for the dropdown
    of the connected account's own playlists, `testYoutubeAccount` mirrors
    Gmail's token-scope check). Google blocks API access to the built-in
    "Watch Later" playlist (`WL`) for any account — it never even appears
    in `playlists.list` — so pick a regular playlist instead; not a
    limitation introduced here.

  The OAuth **callback URL** is unified across every service:
  `<this app's origin>/api/settings/google/callback` (e.g.
  `http://localhost:3000/api/settings/google/callback` in dev) — it's the
  one Authorized redirect URI to register on the Google Cloud OAuth client
  (shown next to the Client ID/Secret fields on the Integrations → Google
  page),
  even when Gmail and YouTube use separate clients. `/api/settings/google/
  connect?service=gmail|youtube` kicks off the flow; the CSRF `state` token
  (`app/api/settings/_oauth-state.ts`) is tagged with which service started
  it, so the single callback route knows whether to finish as
  `connectGmailAccount` or `connectYoutubeAccount`.
  - `youtube-download.ts` — given a video ID + workspace folder, runs
    `yt-dlp` three times (mp4, audio, subtitles) into
    `<workspaceFolder>/<videoId>/`, tracking job state in a process-local
    map polled by `GET /api/youtube/process/:videoId`. Needs `yt-dlp` (and
    `ffmpeg`, which `yt-dlp` shells out to for merging/audio extraction) on
    `PATH`.
- `src/index.ts` — exports `startRun(taskId)` (creates a run row, spawns the
  harness in the background, resolves immediately) shared by
  `POST /api/tasks/:id/runs`, `scheduler.ts`, and this file's own
  `start-run` CLI entry.

## Gotchas found during implementation (don't rediscover these)

- `data/data.db`/`data/logs.db` are gitignored and created on first use;
  delete them freely to reset local state.
- `startRun` never awaits the harness process — it marks the run `running`
  and returns the run id immediately; `runHarness(...).then/.catch` moves it
  to `completed`/`failed` in the background. A run stuck `pending` forever
  would permanently block the task from starting a new one (the "already
  active" guard treats `pending`/`running` as active), so `createRun` +
  `updateRunStatus(..., "running")` happen back-to-back with no await
  between them.
- Turbopack will refuse to build cleanly (whole-project tracing warning) if
  `db.ts`'s dynamic path resolution loses its `turbopackIgnore` comments —
  it's a local sqlite path, not a project asset.
- The harness process actually running end-to-end needs the real CLI
  (`pi`/`claude`/`agy`) installed and authenticated on `PATH` — nothing here
  has been run against a live harness.
