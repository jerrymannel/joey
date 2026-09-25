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
npm run logs                    # tail data/joey.log, pretty-printed; `-- -L warn` filters by level
```

Run `typecheck` + `build` + `test` after any change.

## Redesign in progress

Tasks are being rebuilt as `tasks/<slug>.yaml` files of script and agent steps — read
`docs/redesign.md` (the agreed design and the engine as built) before touching tasks, runs,
automations or the mailbox. The new engine (`definitions.ts`, `task-run.ts`, `agent-session.ts`,
`task-runs.ts`, `scripts/`, `tasks/`, `prompts/`) runs alongside the old model described below
until the UI moves over; the old model is then deleted and this guide rewritten. Joey's own
wording moved from `prompts/` to `src/engine/templates/` — `prompts/` now holds agent prompts.

## CRUD pattern

Every user-editable resource (Tasks, Automations, Models, Prompts —
and any new one) follows the same four-screen shape. Don't improvise a
different shape (inline edit-in-place, modal forms, accordion rows) for a
new resource; follow this one so the app stays predictable to navigate.
(Exception: a resource with only a handful of short fields — currently Models
and SSH — may use the slide-over variant described at the end of this section
instead of separate pages. Another exception: Tools is a read-only list —
the catalog lives in code, see `tools.ts` — with no New/View/Edit/Delete.)

- **List** (`/resource`) — a table rendered with `app/components/DataGrid.tsx`
  (ag-grid). Row click navigates to that row's View page. A "+ New" button
  navigates to the Create page. No inline editing in the grid itself.
- **Create** (`/resource/new`) and **Edit** (`/resource/[id]/edit`) — a plain
  form page, not a modal. Buttons are "Save" (Edit) / "Create" (Create) and
  "Cancel" — Cancel returns to the List (Create) or View (Edit) page without
  saving.
- **View** (`/resource/[id]`) — read-only fields plus an "Edit" button
  (→ the Edit page) and a "Cancel"/back button (→ the List page). Anything
  beyond plain CRUD fields for that resource (e.g. an automation's run log)
  renders below the read-only fields on this page.
- **Delete** — never a route; a button (on the List row's actions or the
  View page) opens `app/components/ConfirmModal.tsx` and only deletes on
  confirm.

**Slide-over variant** (`app/configurations/models/page.tsx`): the resource has
no `/new`, `/[id]` or `/[id]/edit` routes. Row click opens
`app/components/SidePanel.tsx` in View mode (Edit / Delete / Close), "+ New"
opens it with the form, and Edit swaps the panel's content for the same form;
Delete still goes through `ConfirmModal`. The List carries an "Enabled"
checkbox column and a per-row Delete button (skipped for protected rows), and
`DataGrid` ignores row clicks that land on a button/input inside a cell.

## Layout

- `app/` — Next.js App Router. `app/api/**/route.ts` are the HTTP API (still
  under `app/api/settings/**` for historical reasons — not renamed with the
  UI, since that would break any already-registered OAuth redirect URIs).
  `app/tasks/**/page.tsx` are the plain-task UI pages (service `"generic"`,
  per task-board.ts), following the CRUD pattern above.
  `app/automations/[service]/**/page.tsx` is the same CRUD pattern for
  gmail/youtube/transcription automations — Task rows with `service` set to `"gmail"`,
  `"youtube"` or `"transcription"` instead of `"generic"`; one route tree serves both since the
  shape is identical. `app/configurations/{models,prompts,tools,ssh}/**` are the
  pages for the picker resources (Models and SSH use the slide-over variant — one
  page, no sub-routes; Tools is a read-only list) (`src/engine/models.ts`,
  `prompts.ts`, `tools.ts`). A task's prompt is picked from Prompts (a select
  on the task forms), not typed in. Automations have no prompt, model,
  thinking level or tools: a run writes its output into the automation's
  folder (`automation-run.ts`). `app/results/page.tsx` lists the results
  folder's files plus the agent inbox's emails (`GET /api/results`,
  `GET /api/mail`; see `mailbox.ts` below) and can show the linked run log. A Gmail automation runs against mail matching a
  Gmail search query, stored as `searchQuery` on the Task (`search_query`
  column — unused by other services); `AutomationForm.tsx` first asks which
  connected account (`account` on the Task, an email; empty = the first
  connected one) the automation runs as — the search preview, the playlist
  list, `automation-run.ts` and the Downloads section all read as that
  account. It then shows a "Gmail
  search string" field with a "Search" button (only when
  `service === "gmail"`) that previews the top 10 matches via
  `GET /api/gmail/search` (from/subject/read-unread), and the View page shows
  the saved query read-only alongside the other CRUD fields.
  `AutomationForm.tsx` has no folder-path field at all — a gmail/youtube
  automation's working folder is always
  `<general workspace folder>/<automation id>`, computed and `mkdir`'d by
  `createTask` itself (see `task-board.ts` below); it only shows up read-only
  on the View page. `app/settings/general` holds the workspace folder,
  the results folder and the agent mailbox account, backed by `src/engine/settings.ts`'s
  `getWorkspaceFolder`/`saveWorkspaceFolder`, `getResultsFolder`/
  `saveResultsFolder`, `getMailAccount`/`saveMailAccount`, `getUserEmail`/`saveUserEmail` (the user's own address, a General setting) and `GET`/`PUT /api/settings/general`. The YouTube video-downloader is likewise not a
  standalone page anymore — it's the "Downloads" section
  (`app/components/YoutubeDownloads.tsx`) on a youtube automation's own View
  page: playlist videos, per-video download status, a "Process"/"Process
  all" button, a Simulate preview, and a run log, all scoped to that
  automation's own `folderPath` (no more picking "which automation's
  workspace" from a dropdown — the automation you're looking at *is* the
  workspace). Which playlist to download from is `playlistId` on the Task
  (`AutomationForm.tsx` shows a "Playlist" select, populated from
  `GET /api/youtube/playlists`, for `service === "youtube"`), not a global
  setting. `app/integrations` is a provider list — a
  side panel (`app/integrations/layout.tsx`, currently just "Google", add
  an entry to its `PROVIDERS` array when a non-Google provider shows up)
  next to whichever provider's page is open. `app/integrations/google`
  holds the Google OAuth client setup (Client ID/Secret) and, below it,
  one card per connectable service (Gmail, YouTube) with connect/disconnect
  and a "Test" button that shows which scopes/services a connected account
  actually has access to. The sidebar (`app/components/Sidebar.tsx`) groups
  General settings and Integrations under "Settings" (nothing service-page
  leftover there anymore — Gmail's search/reply and YouTube's downloader
  both moved under Automations), Gmail/YouTube automations under
  "Automations", and the three Configurations CRUD pages under
  "Configurations".
  `app/components/*.tsx` are shared client components — `DataGrid.tsx` and
  `ConfirmModal.tsx` back the CRUD pattern above; `AutomationForm.tsx` and
  `RunLogPanel.tsx` are the automation-specific Create/Edit form and
  run-log-with-side-detail-panel, reused by both `app/automations` and (for
  `RunLogPanel`) `app/tasks`; `YoutubeDownloads.tsx` is the View-page-only
  downloader section described above. `app/lib/types.ts` duplicates
  (deliberately — see its own comment) the client-facing shapes of
  `src/engine`'s types so
  nothing server-only (`better-sqlite3`) risks reaching the client bundle.
- `src/engine/*.ts` — plain TS, no Next.js dependency.
  - `db.ts` — SQLite handles + migrations for three databases in `data/`: `data.db`
    (`getDataDb`: the tasks), `settings.db` (`getSettingsDb`: the `settings` key/value
    table plus the Configurations — models, prompts, ssh_configs, tools) and `logs.db`
    (`getLogsDb`: runs, youtube_runs). Put a new table in the one that matches: settings →
    settings.db, logs → logs.db, anything else the app works on → data.db. `DATA_DB_PATH`
    moves all three (the others sit beside it unless `SETTINGS_DB_PATH` / `LOGS_DB_PATH`
    say otherwise). Opening settings.db copies the five tables' rows out of an older
    data.db once and drops them there (`moveLegacySettings`).
  - `task-board.ts` — CRUD for tasks (name, folder, `promptId`, harness, CLI
    params, model, schedule, `service`, `toolIds`, `searchQuery`,
    `playlistId`, `thinkingLevel`, `trustFolder`). `service` is what makes a
    row a plain task (`"generic"`) vs. a gmail/youtube automation — same
    table, same run/harness machinery, just scoped differently by the UI
    (see the CRUD pattern above). `promptId` is a `prompts.ts` row id;
    `Task.prompt` is read-only and resolved from it on every read (the old
    free-text `prompt` column is only a fallback for tasks from before
    prompts were picked from the list; the prompts API refuses to delete a
    prompt a task uses). `toolIds` are ids from `tools.ts`.
    `searchQuery` is the Gmail search string a gmail automation runs
    against; `playlistId` is the YouTube playlist a youtube automation
    downloads from (see `YoutubeDownloads.tsx`) — each ignored by the other
    services. `transcribe` (youtube only; a checkbox on `AutomationForm.tsx`, on by default for new automations) makes every
    download — a run's and the Downloads section's "Process" — end with a whisper transcript of
    `audio.mp3` as `audio.mp3.transcribed.txt` (`youtube-download.ts`'s `transcribing` state, after
    the download's own herdr tab is closed). `thinkingLevel` (one of `THINKING_LEVELS`) and `trustFolder`
    are pi-only run options (see `harness.ts`) — shown on the generic task
    Edit/View pages only when that task's `harness === "pi"`; automations
    don't use them. Every task id
    is a dash-free `randomUUID()` (`.replace(/-/g, "")`). For a
    `"gmail"`/`"youtube"` `createTask` call, `folderPath` isn't taken from
    the caller — it's `join(getWorkspaceFolder(), id)`, and `createTask`
    `mkdirSync`s it on the spot; throws if no workspace folder is configured
    yet (see `app/settings/general`). A plain `"generic"` task gets the same
    default (and the same throw with no workspace folder configured) only
    when its own `folderPath` is left blank — the New task form's field is
    optional for exactly this — so it can still be pointed at an existing
    project folder by typing one in, on Create or Edit.
  - `ssh.ts` — SSH configurations (Configurations → SSH: name, IP, username,
    auth method `password` | `identity`, and the password or private-key file
    content, stored AES-GCM-encrypted via `crypto.ts` in `ssh_configs.secret` and
    never returned by the API — an Edit with a blank secret keeps the stored one).
    `runSshCommand(name, command)` runs the system `ssh` (`JOEY_SSH_BIN`
    overrides the binary) in a herdr tab (`herdr.runInTab`), stdout/stderr redirected to temp
    files that are read back: a password goes in through `SSH_ASKPASS` (a temp script
    `cat`ing a 0600 password file — never the typed command line, which herdr shows and keeps),
    a key through a 0600 temp file, both removed afterwards; host keys
    are trusted on first use. Host/username are validated so they can't be read as
    ssh options. Reached by the pi tools `ssh_list_servers` / `ssh_run_command`
    (service `ssh` in `tools.ts`, picked per task like Gmail's) which refuse to run
    unless the task has them enabled (`pi-tools/tool-access.ts`, `taskHasTool`) —
    pi registers every tool for every run, so tools with real reach check themselves.
  - `transcription-run.ts` — a `"transcription"` automation's run (sidebar: Automations → Transcription) (`automation-run.ts` hands off to it): the
    Task's `folderPath` is a folder the user picked (an existing absolute path, typed in — unlike
    gmail/youtube it is not derived from the workspace folder, and it may be the same folder as another task: `tasks.folder_path` is no longer
    `UNIQUE`, `db.ts` rebuilds an older table to drop it, and `getTaskByFolder` ignores transcription rows) and `extensions` (`extensions` column,
    normalised by `normalizeExtensions` to `mp3,wav`; both validated in `task-board.ts`) says which
    files match. A run walks the folder and all sub folders (dot-folders skipped), transcribes each
    match to `<file name with extension>.transcribed.txt` beside it (e.g. `talk.mp3.transcribed.txt`;
    one that already has a transcript is skipped, so scheduled runs only do what's new; a failing
    file is logged and the rest carry on, failing the run at the end), then rewrites
    `transcribed-files.txt` at the root: the full path of every `.transcribed.txt` under it.
    `AutomationForm.tsx` shows the folder + extensions fields for it instead of the Google account.
  - `whisper.ts` — `transcribeAudio(file, {model, language, outputPath})` runs the `openai-whisper` (in a herdr tab, output teed to a temp log for the error message)
    CLI (`uv tool install openai-whisper` — plain `pip` is refused by PEP 668 on Homebrew Python, see the README; `JOEY_WHISPER_BIN` overrides the binary,
    `JOEY_WHISPER_MODEL` the default model, `base`) and writes `<name>.txt` next to the audio
    file (or at `outputPath`, via a `.whisper-*` scratch folder beside it so nothing existing is overwritten), returning its text. Reached by the pi tool `whisper_transcribe_audio` (service
    `whisper` in `tools.ts`, opt-in per task like ssh's via `requireToolEnabled`).
  - `models.ts` / `prompts.ts` / `tools.ts` — CRUD for the automation-picker
    resources shown under Configurations. `tools.ts` is a read-only catalog
    defined in code (`DEFAULT_TOOLS`; the mailbox ones are named `mailbox_*` like
    their pi tools, are `alwaysOn` — granted to every task, shown checked and
    disabled on the task forms, never stored in `toolIds` — and a row saved
    under an older display name is renamed in place via `renamedFrom`): every listing first inserts any entry
    missing from the table (by service + name), so a tool added to the code
    — add a row there for every new file in `pi-tools/` — always shows up
    under Configurations → Tools, on existing databases too; `models.ts` seeds
    pi's own `provider/id` model catalog (`pi --list-models` —
    `antigravity/gemini-3-*`, `claude-bridge/claude-*`) the same way, but
    those rows are protected: `AiModel.isDefault` (recognised by `value`, no
    column) means `updateModel` only honours `enabled` and `deleteModel`
    throws (the API answers 403). `AiModel.enabled` (`enabled` column,
    `ensureColumn`-migrated) hides a model from the task/automation model
    pickers — those filter `GET /api/models` client-side — without touching
    tasks that already use it. `models.ts`'s
    `AiModel` has an `endpoint` field (custom API base URL) alongside
    `value` — `ModelForm.tsx` (shared by Create and Edit, rendered in the Models page's
    side panel) offers a "Standard model" radio (a short curated dropdown) vs.
    "Custom (own endpoint)" (free-text name/value/endpoint). `getModelByValue`
    looks up a model row by its `value`, since a Task only stores the raw
    `--model` string, not a models-table id — that's how `harness.ts` finds
    a model's `endpoint` at run time.
  - `mailbox.ts` / `inbox-scheduler.ts` — agent mail over one real Gmail
    inbox, plus run results as files. The inbox is the connected Gmail
    account picked as the "Agent mailbox" in General settings
    (`getMailAccount`, e.g. `manneljoey@gmail.com`); every generic task is
    reachable at `manneljoey+<task id>@gmail.com` (`mailAddress`; shown as
    the "Email" field on the task's View page, `GET /api/tasks/:id/address`).
    `mailbox_send_message` (pi-tools) sends through the Gmail API (`sendMail`) to that address; an
    agent's mail carries `X-Joey-From` (its task id), `X-Joey-Run`,
    `X-Joey-Hops` and a Reply-To of its own address named after the task; every mail is From "Joey" (the mailbox account). A human's has none of the headers.
    `tickInbox` (every `MAILBOX_TIMER` s, default 30) fetches `in:inbox
    is:unread` (`scanInbox`), and triggers the recipient of the oldest mail
    to a startable task; `startRun` then `claim`s that task's unread mail —
    marking it read is the delivery — and prepends it to the prompt. Mail
    not addressed to a job is left unread and ignored; unknown recipients
    are logged once. Hops: a pi run handed mail gets `MAIL_HOPS` = the
    deepest hop it received, and `mailbox_send_message` sends hops + 1 (`nextHops`),
    refused past `MAX_HOPS` (5). The sender's original prompt is appended to
    the body of a chain's first message only. Needs the `gmail.modify`
    scope, so Gmail accounts connected before it was requested must be
    reconnected. A run ends with one email (`deliverResult`): the pi tool
    `mailbox_send_result` (or, for the other harnesses, their stdout when
    they exit cleanly) either emails the result to
    the user's email from General settings (`getUserEmail`, sent from the mailbox account, cc the mailbox account) — or, while none is set, `manneljoey+results@gmail.com` — closing the task. The copy in the mailbox is filed read and labelled `RESULT` plus the task's name (`RESULT_LABEL`; labels are created if missing, and a label failure is logged, not fatal) (the +results fallback is `RESULTS_ID`;
    the poller never picks it up) — or, with `to` set to an agent id, mails
    that agent instead (a hand-off: unread, so it triggers its run; hops and
    the first-message prompt work as in `mailbox_send_message`). Either way a
    copy is filed as a flat `<results folder>/<ISO timestamp>-<id>.md`
    (`from: Job name (job id)`, `run:`, `to:` (the hand-off recipient, empty
    for a closing result), `subject:` front matter) — the durable record: the
    run panel and the Results page read it, its `run` id links to the run
    log ("Read log"), and its existence is how a run is known to have sent
    its result. A closing result's email failing is logged and reported to
    the agent but the file stays; a hand-off's failing files nothing and
    errors to the agent. With no agent mailbox account, a closing result is
    only filed. The Results page lists the files plus the inbox's other mail
    (`GET /api/mail`, minus the `+results` mails, which the files already
    represent). The results folder is a General setting, default
    `<cwd>/results`.
  - `automation-run.ts` — what "Start run" does for a gmail/youtube/transcription
    automation (no LLM): `startRun` (`src/index.ts`) picks harness vs. this by
    `service`, and this in turn just dispatches to each automation's own module
    and wires its progress into the run log — the actual per-service logic
    lives outside `src/engine` entirely, in `automation/` (see below), except
    transcription's, which is small enough to stay at `transcription-run.ts`.
  - `run-log.ts` — CRUD for runs (status, accumulated output log).
  - `harness.ts` — builds the task's harness command (`buildArgs`, shared by
    the real run and `describeCommand`'s preview) and runs it. `-p <prompt
    with tools prepended>` and `--model <value>` apply to every harness;
    `--thinking <level>` and `--approve` (from `thinkingLevel`/`trustFolder`;
    both confirmed against `pi --help`) apply only when `harness === "pi"`.
    pi has no base-URL flag or env var, so a pi run of a model with a custom
    `endpoint` is passed as `--model joey-<model id>/<value>`, and
    `pi-herdr.ts`'s `syncPiCustomModels` registers that provider in
    `~/.pi/agent/models.json` before each run (other providers in the file
    are left alone; assumes an OpenAI-completions-compatible server). Other
    harnesses still get `ANTHROPIC_BASE_URL` set.
    `adk` is a listed-but-unimplemented harness and rejected outright.
    Every pi run also gets `--mode json` (pi's structured JSON-event-stream
    output, see `pi-herdr.ts` below) — pi is the only harness run this way,
    since it's the only one whose CLI offers it.
    `toolIds` aren't executed as real tool calls for any harness but `pi` —
    `withTools()` just prepends the enabled tools' names/descriptions to the
    prompt text there, since there's no tool-calling loop for those. For
    `harness === "pi"`, `buildArgs` also adds `--extension
    <repo>/pi-tools/index.ts` (an absolute path — see below), so those tools
    are additionally real, callable pi tools, not just prompt text.
    Every harness runs inside a herdr tab. Everything except `"pi"` goes
    through `harness.ts`'s `runCliInHerdr`: `bash -c 'set -o pipefail; MODEL=… claude … 2> stderr | tee stdout'`,
    the two temp files copied into the run log when it exits and stdout filed/emailed as the result.
    `"pi"` instead delegates to
    `pi-herdr.ts`'s `runPiInHerdr`, which runs it in a herdr tab the same
    one-shot way `herdr.runInTab` runs everything else — visible/inspectable
    like `youtube-download.ts`'s yt-dlp jobs, cwd'd to the task's own folder.
    Env vars (`DATA_DB_PATH`/`SETTINGS_DB_PATH` to this repo's
    `data/data.db`/`data/settings.db` by absolute path, since `db.ts`
    otherwise resolves them against `process.cwd()` — the task's own folder
    here, not this repo, which would silently point pi-tools at a
    nonexistent database — plus `RESULTS_DIR`, `TASK_ID`, `RUN_ID` and, once
    mail was delivered, `MAIL_HOPS` for the mailbox tools) are inlined as a
    shell prefix on the command string (`DATA_DB_PATH=... pi ...`) since
    herdr types the command into a pane's shell rather than us spawning `pi`
    directly. pi's `--mode json` stdout (see `harness.ts`'s `buildArgs`
    above) is teed to a temp file and its stderr redirected to another,
    both read back once the run exits; `formatPiTranscript` renders the
    stream's final `agent_end` event (the authoritative full message list —
    simpler than reassembling the streamed `message_update` deltas) into a
    readable transcript — assistant text, `→ tool(args)` calls, `✓`/`✗`
    tool results — appended to the run log, falling back to the raw stream
    if pi never got there. Every pi prompt still ends with a "Mailbox
    tools" block (`MAILBOX_INSTRUCTION`, harness.ts) telling the agent to
    use `mailbox_list_agents` / `mailbox_send_message` — not the Gmail
    tools — to talk to other agents and to call `mailbox_send_result` as
    its last action, which files the output in the results folder tagged
    with `RUN_ID`; that call is unaffected by the JSON-mode capture above —
    it's still the one way a run closes or hands off (hops, hand-off
    addressing, filing/labeling/email all key off it), the run log's
    transcript is purely for observability (plus a note if no result was
    sent).
  - `cron.ts` / `scheduler.ts` — minutely 5-field cron matching against
    each task's `schedule`; `instrumentation.ts` ticks it every 30s.
  - `google-auth.ts` — the generic Google OAuth handler (auth-URL building,
    code-for-refresh-token exchange, access-token refresh, `tokeninfo`
    introspection) shared by every Google-family integration; `gmail.ts`
    and `youtube.ts` each just supply their own scopes and `GoogleApp`.
  - `prompt-files.ts` / `prompts/` — the wording Joey adds around a task's
    prompt (the mailbox instruction for pi runs, the tools heading, the inbox
    heading, the sender-prompt suffix) lives in `prompts/*.md`, read on every
    use so an edit applies to the next run (`promptFile(name, vars)`; see
    `prompts/README.md` for the file → placeholder table). Not the
    Configurations → Prompts resource, which is a task's own prompt. The folder
    is `./prompts` or `PROMPTS_DIR` (pi-herdr.ts passes it absolute — the
    mail code runs in pi's process, cwd'd to the task folder). Tool
    descriptions stay in `pi-tools/*.ts` and `tools.ts`: they're tool schemas.
  - `logger.ts` — the one pino logger (`log("mod")` gives a child tagged with
    its module; `errMsg` for caught errors). Two sinks with their own levels:
    console via pino-pretty (`LOG_LEVEL`, default `info`) and JSON lines in
    `data/joey.log` (`LOG_FILE`, `LOG_FILE_LEVEL`, default `debug`), so there's
    detail to read back after something failed; `LOG_CONSOLE=off` drops the
    console sink (pi's tools set it: their logs go to the same file from
    pi's process). Silent under `npm test` unless `LOG_LEVEL` is set. What
    logs at which level: error = a run/poll/send/Gmail call failed, warn =
    something skipped or off-nominal (unknown recipient, hop cap, a run that
    never called `mailbox_send_result`), info = run/mail/result lifecycle,
    debug = each Gmail API call, inbox scans, harness/herdr commands, trace =
    finest. Don't `console.*` in engine code — use it. No rotation yet.
  - `crypto.ts`, `gmail.ts`, `settings.ts` — the Gmail integration (OAuth,
    search/read/draft/send/mark-read — sending is only used by mailbox.ts). `settings.ts` also holds the
    general workspace folder (`getWorkspaceFolder`/`saveWorkspaceFolder` —
    see `task-board.ts`'s `createTask`) and the generic `GoogleApp` (Client
    ID/Secret) storage shared by every
    Google-family integration, plus `usesGmailApp(service)` /
    `resolveYoutubeApp()` for opting a service into reusing Gmail's OAuth
    client instead of registering its own — one Google Cloud OAuth client
    can serve Gmail, YouTube, and future Google integrations alike, since
    scopes are requested per auth flow, not baked into the client.
    `testGmailAccount(email)` hits Google's `tokeninfo` endpoint to show
    exactly which scopes a connected account's token actually carries —
    the "Test" button next to each account on Integrations.
  - `youtube.ts` — YouTube integration (OAuth, `playlistItems.list` against
    a playlist ID (an automation's `playlistId`), `fetchMyPlaylists` for the
    playlist dropdown on `AutomationForm.tsx`, `testYoutubeAccount` mirrors
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
  - `herdr.ts` — thin wrapper around the external `herdr` CLI (tabs/panes a
    human can also watch): `createTab`/`runInPane` (blocks on a
    caller-unique sentinel until the command's real exit code comes back,
    not just its echoed input)/`closeTab`, and `runInTab` (a tab of its own for one command: exit
    code as a value, `timedOut`, tab always closed — **every command Joey runs that isn't herdr
    itself goes through herdr**; add new ones with `runInTab`, writing any output you need to temp
    files, and never type a secret into the command line), plus `describe*` variants for
    preview-only text. `JOEY_HERDR_BIN` swaps the binary — tests use `src/test-support/fake-herdr.ts`
    so nothing opens real tabs. `shellQuote` single-quotes a value for real
    execution inside a pane's live shell — shared by `youtube-download.ts`
    and `pi-herdr.ts` (its own `quote` is separate and only for the
    `describe*` preview strings).
  - `pi-herdr.ts` — runs `pi` inside a herdr tab and captures/parses its
    `--mode json` output into the run log; see `harness.ts` above for the
    full flow. Known limitation: the transcript only appears once the run
    exits (`formatPiTranscript` runs on the whole captured stream after the
    fact), not live.
  - `youtube-download.ts` — downloads run strictly one at a time across all videos (`enqueue`, a promise chain: one yt-dlp command after another, never parallel requests to YouTube; a queued video shows `queued`). Given a video ID + workspace folder (an
    automation's own `folderPath`), runs `yt-dlp` three times (mp4, audio,
    subtitles) into `<workspaceFolder>/<videoId>/`, tracking job state in a
    process-local map polled by `GET /api/youtube/process/:videoId`. Needs
    `yt-dlp` (and `ffmpeg`, which `yt-dlp` shells out to for merging/audio
    extraction) on `PATH`. `youtube-run-log.ts`'s `listYoutubeRuns` takes an
    optional `artifactDirPrefix` (a `LIKE` filter on `artifact_dir`) so
    `GET /api/youtube/runs?folderPath=...` can scope a run log to one
    automation, since runs themselves don't carry a task id.
- `src/index.ts` — exports `startRun(taskId)` (creates a run row, spawns the
  harness in the background, resolves immediately) shared by
  `POST /api/tasks/:id/runs`, `scheduler.ts`, and this file's own
  `start-run` CLI entry.
- `pi-tools/` — a real `pi` extension (`pi.registerTool()`/`defineTool()`,
  per `@earendil-works/pi-coding-agent`'s extension API), loaded by every pi
  run via `harness.ts`'s `buildArgs`. One file per tool —
  `gmail_search_emails.ts`, `gmail_read_email.ts`, `gmail_list_labels.ts`, `gmail_create_label.ts`, `gmail_delete_label.ts`, `gmail_label_email.ts` (label helpers in `gmail.ts`: `ensureLabels` creates missing ones, matched case-insensitively), `youtube_list_playlists.ts`,
  `youtube_show_playlist_contents.ts`, `mailbox_send_message.ts`, `mailbox_list_agents.ts`,
  `mailbox_send_result.ts`, `mailbox_list_labels.ts`, `mailbox_label_mail.ts` (the same on the agent mailbox account; a handed mail's id is in the inbox text), `ssh_list_servers.ts`, `ssh_run_command.ts`, `whisper_transcribe_audio.ts` — each `export default defineTool({...})`;
  `index.ts` just imports each and calls `pi.registerTool()` on it, and
  `json-result.ts` is the shared result-truncation helper (see
  docs/extensions.md's "Output Truncation") they all use. These back the
  tools from `tools.ts`'s `DEFAULT_TOOLS` that already have a backing engine
  function (search/read email via `gmail.ts`, list playlists/show playlist
  contents via `youtube.ts`), making them tools the LLM can actually call,
  not just read about in the prompt. The rest of `DEFAULT_TOOLS` (YouTube
  search, add video to playlist, retrieve video details) have no engine
  function yet, so they stay prompt-text-only via `harness.ts`'s
  `withTools()` until one exists — "add video to playlist" in particular
  needs a broader YouTube OAuth scope than `youtube.ts` currently requests,
  which would force reconnecting any already-connected account.
  `@earendil-works/pi-coding-agent` and `typebox` are devDependencies purely
  for writing/typechecking these files — pinned to the versions the
  installed `pi` CLI itself uses.
- `automation/<service>/app.ts` (currently `gmail`, `youtube`) — each
  automation's own run logic, kept out of `src/engine` so the main codebase
  isn't cluttered with every integration's details. One `run(task, note)`
  per file, called by `src/engine/automation-run.ts`'s dispatcher; no
  separate cron wiring — the task's own `schedule` field and
  `src/engine/scheduler.ts` already start a run (any service) the same way,
  and that run's progress/result is the same run log every task gets, shown
  on the automation's View page. `gmail/app.ts` saves search matches as
  `<message id>.md`; `youtube/app.ts` starts downloads of new playlist
  videos (delegating to `youtube-download.ts` for the actual yt-dlp work,
  since that's shared with the Downloads section's own "Process" button).

## Gotchas found during implementation (don't rediscover these)

- `data/data.db`/`data/settings.db`/`data/logs.db` are gitignored and created on first use;
  delete them freely to reset local state (settings.db holds the OAuth tokens and SSH secrets).
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
- `claude`/`agy` runs need the real CLI installed and authenticated on
  `PATH` (the herdr pane's shell PATH, not the app's) — nothing here has exercised them end-to-end
  yet (only against a fake `claude`, see `harness.test.ts`). `pi` runs HAVE
  been exercised for real (see `pi-herdr.ts`). The earlier exit-1 was `--thinking-level` (not a
  pi flag — it's `--thinking`) and `--dangerously-skip-permissions` (`--approve`
  is the closest, "trust project-local files"); check `pi --help` before
  adding any new pi flag.
- Adding a column to the `tasks` table? `CREATE TABLE IF NOT EXISTS` doesn't
  retrofit it onto a `data.db` that already has that table from before the
  column existed. `db.ts`'s `ensureColumn()` runs `ALTER TABLE ... ADD
  COLUMN` by hand for exactly this reason — extend it (or add a matching
  call) instead of telling people to delete `data.db`; the same goes for the
  other databases, whose `settings.db` also holds OAuth tokens worth keeping.
