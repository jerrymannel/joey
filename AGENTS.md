# Joey — Build Guide

TypeScript/Next.js app that runs tasks made of **scripts** and **agents**. A task is a hand-edited
`tasks/<slug>.yaml`: a list of steps, each either a script (deterministic code) or an agent (a `pi` session
guided by a prompt, with Joey's tools and MCP servers), optionally with review loops between agents. Tasks run
on demand or on a cron schedule; every run keeps its steps' outputs, the agents' sessions and a result.
[docs/redesign.md](docs/redesign.md) is the design (and the file formats) — read it before changing how tasks
or runs work.

## Commands

```bash
npm install
npm run dev         # next dev, http://localhost:3000
npm run build       # next build — must stay clean (no errors; warnings ok)
npm run typecheck   # tsc --noEmit
npm test            # node's built-in test runner via tsx, src/**/*.test.ts
npm run start-run -- <slug>     # runs tasks/<slug>.yaml, waits, exits non-zero unless it completed
npm run logs                    # tail data/joey.log, pretty-printed; `-- -L warn` filters by level
```

Run `typecheck` + `build` + `test` after any change. Don't `next build` while someone's `next dev` is running
on the same checkout — it has left the dev server with a stale route table; build a copy instead.

## What lives where

Definitions are files, hand-edited, read on every use (an edit applies to the next run), all under `JOEY_HOME`
(default: the repo):

| Path | What |
|---|---|
| `tasks/<slug>.yaml` | A task: `name`, optional `schedule` (5-field cron), `steps`. Each step is a script or an inline `agent:` (`{ model, thinking? }`) with `instructions:` (or `instructionsFile:`). The slug is its id, its workspace folder name and its URL. |
| `scripts/<name>/config.yaml` + `scripts/<name>/app.ts` | The scripts a step can run: each folder's `config.yaml` gives its command (default `app.ts`), description and params (a param's `source:` — `gmail-account`/`youtube-account`/`youtube-playlist` — makes the New task form show a dropdown). `scripts/joey.ts` is the helper every script imports. |
| `prompts/<name>.md` | Reusable agent instructions — an agent step's `instructionsFile:` names one; read at run time. |
| `skills/<name>/` or `skills/<name>.md` | Agent skills. Every agent gets every skill (pi's `--skill`), like the tools. |
| `mcp.json` | MCP servers (`{ "mcpServers": { … } }`). Every agent gets every server. Not `.mcp.json` — that one is Claude Code's. |
| `models.yaml` | The models an agent's `model:` can be (`{ models: [ "provider/id" \| { name, endpoint } ] }`) — a string is a pi `provider/id`; a `{ name, endpoint }` is a local, OpenAI-compatible model. The New task form's model list. |
| `src/engine/templates/*.md` | Joey's own wording around step instructions and the review loop (`templates.ts`; table in its README). |

The databases (`data/`, gitignored) only hold state: `data.db` → `task_state` (paused), `logs.db` →
`task_runs` + `run_steps`, `settings.db` → `settings` (encrypted key/value) + `ssh_configs`. Put a new table in
the one that matches. `DATA_DB_PATH` moves all three (the others sit beside it unless `SETTINGS_DB_PATH` /
`LOGS_DB_PATH` say otherwise). The `gmail-search` script keeps its own `gmail.db` (beside `data.db`) of
already-processed message ids, so it never fetches the same mail twice.

## Engine — `src/engine/*.ts` (plain TS, no Next.js)

- `definitions.ts` — loads and validates the files above (`loadTask`, `listTaskFiles`, `loadScripts`,
  `loadMcpServers`, `listPrompts`, `listSkills`, `loadModels`). A task file that doesn't validate is listed with its `errors` and can't run.
  `isTaskSlug` guards every slug that comes from a URL before a path is built from it. `agentLabel(prompt)` is a step's readable id (its prompt basename).
- `task-run.ts` — `startTaskRun(slug)`: validates, refuses a task that's already running, creates
  `<workspace>/<slug>/<local time>/` (`RUN_DIR`; `<workspace>/<slug>/` is `TASK_DIR`, kept between runs) and the
  run's DB rows, returns at once and runs the steps in the background. A **script** step runs
  `tsx <command>` (or the executable itself) in a herdr tab with `RUN_DIR`, `TASK_DIR`, `STEP_INPUT`,
  `STEP_OUTPUT`, `JOEY_PARAMS` plus the DB/log paths in its env; its stdout/stderr go to
  `steps/NN-<name>.log` and the run log, its output is what it wrote to `STEP_OUTPUT`, exit 0 = success. An
  **agent** step opens its own session (each agent step is a separate `pi` session — no shared, named agents) and
  sends the step message (`templates/step.md`: its `instructions`, folders, earlier outputs' paths, the previous
  step's output inline up to 20k chars). A step with `reviews: N` loops: reviewer → `task_review_verdict` →
  feedback into step N's own session → revision back to the reviewer, until `approve` or `maxRounds`; either way
  the latest version is the step's output (revisions saved as `NN-<agent>.rK.md`). The first failing step fails the run
  and skips the rest; every step has a timeout (default 30m). `result.md` is what `task_send_result` wrote, else
  the last step's output. Agent tabs are closed when the run ends. Exports the pure command builders
  (`scriptCommandLine`, `stepInstruction`, `runEnv`, `stepFile`) so the simulator reuses the real thing.
- `simulate.ts` — `simulateTask(slug)`: the herdr + pi commands a run would issue, built from the same helpers
  as `task-run.ts`/`agent-session.ts` (so they can't drift), with placeholder ids — runs nothing. The Simulate
  button.
- `agent-session.ts` — one agent step = one interactive `pi` in its own herdr tab, alive for the rest of the run:
  `openAgentSession` (tab, `export` of its env, `herdr agent start --kind pi` with `--session-dir
  RUN_DIR/sessions/<NN-agent>`, `--model`, `--thinking`, `--extension pi-tools/index.ts`, `--mcp-config` with
  all of `mcp.json`'s servers, and `--skill` for each skill), `ask` (`herdr agent prompt --wait --timeout`, then the reply read from pi's session
  JSONL — never from the screen; `blocked` or a pi error fails the step), `closeAgentSession`.
  `formatPiMessage` renders a turn for the run log. A `model:` naming a local model from `models.yaml`
  (`loadModels`) is turned into a `joey-<name>/<name>` pi provider/id by `resolvePiModel` (used in `piArgs`),
  and `ensureLocalModels` registers those local endpoints in pi's `~/.pi/agent/models.json`
  (`JOEY_PI_MODELS_PATH` overrides the path) when a session opens.
- `task-runs.ts` — the run/step rows (`createTaskRun` creates the run already `running` with every step
  `pending`, in one transaction, so nothing can leave a run stuck half-created), `setPaused`/`isPaused`,
  `markStaleTaskRunsInterrupted` (startup).
- `pending-input.ts` — the `agent_user_input` wait: `askUser` parks a run (writing `RUN_DIR/question.json` for the
  run API) until `answerUser` (the answer route) delivers the reply. In-process, so a server restart drops the wait
  (the run is then marked interrupted, like any in-flight run).
- `scheduler.ts` — `tickScheduler()`, every 30s from `instrumentation.ts`: once a minute, starts each valid,
  unpaused task whose `schedule` matches (`cron.ts`) and isn't already running.
- `tools.ts` — the catalog of Joey's own pi tools, in code: every file in `pi-tools/` has an entry (the test
  checks both ways), named `<service>_…`. Every agent gets them all.
- `herdr.ts` — wrapper around the `herdr` CLI. **Every command Joey runs goes through herdr** (so a person can
  watch it): `runInTab` for one command (exit code as a value, `timedOut`, tab always closed; write any output
  you need to files, never type a secret into the command line), `createTab`/`runInPane`/`closeTab` for
  several, `startAgent`/`promptAgent` for interactive agents. `shellQuote` for anything typed into a pane.
  `JOEY_HERDR_BIN` swaps the binary — tests use `src/test-support/fake-herdr.ts` (which also fakes
  `agent start`/`agent prompt` via a `JOEY_FAKE_AGENT` script).
- `gmail.ts` / `youtube.ts` / `google-auth.ts` — Google integrations: OAuth (one flow, shared client —
  `usesGmailApp`/`resolveYoutubeApp` in `settings.ts`), Gmail search/read/send/labels, YouTube playlists.
  `testGmailAccount`/`testYoutubeAccount` show the scopes a token really has. Google blocks the built-in
  "Watch Later" playlist (`WL`) for every account — use a regular playlist.
- `youtube-download.ts` — one video → `<folder>/<videoId>/` via `yt-dlp` (mp4, audio, subtitles; optional
  whisper transcript), strictly one download at a time (`enqueue`, a FIFO promise chain), state in memory
  (`getDownloadJob`). Needs `yt-dlp` and `ffmpeg`.
- `transcription-run.ts` — `transcribeFolder(root, extensions, note)`: every matching audio file under `root`
  without a transcript gets `<file>.transcribed.txt`, then `transcribed-files.txt` lists them all.
- `whisper.ts` — `transcribeAudio` runs the `openai-whisper` CLI in a herdr tab (`JOEY_WHISPER_BIN`,
  `JOEY_WHISPER_MODEL`, default `base`); install notes in the README.
- `ssh.ts` — SSH configurations (Settings → SSH; the password or key is AES-GCM-encrypted via `crypto.ts` and
  never returned by the API — an Edit with a blank secret keeps the stored one). `runSshCommand` runs `ssh`
  (`JOEY_SSH_BIN`) in a herdr tab; a password goes in through `SSH_ASKPASS` reading a 0600 file, a key through a
  0600 temp file, both removed afterwards; host keys are trusted on first use; host/username are validated so
  they can't be read as options.
- `settings.ts` — encrypted key/value settings: workspace folder, the Gmail account results are sent from
  (`getMailAccount`), your email (`getUserEmail`), Google clients and accounts. Needs `SETTINGS_ENCRYPTION_KEY`
  (64 hex chars, in `.env.local`).
- `logger.ts` — the one pino logger (`log("mod")`, `errMsg`). Console via pino-pretty (`LOG_LEVEL`, default
  `info`) and JSON lines in `data/joey.log` (`LOG_FILE`, `LOG_FILE_LEVEL`, default `debug`); `LOG_CONSOLE=off`
  drops the console. Silent under `npm test` unless `LOG_LEVEL` is set. error = something failed, warn =
  skipped/off-nominal, info = run lifecycle, debug = each API/herdr call. Don't `console.*` in engine code.

`src/index.ts` is the `start-run` CLI.

## Agents' tools — `pi-tools/`

A pi extension (`index.ts` registers one `defineTool` per file) loaded into every agent. pi registers every
tool for every agent, and every agent may use them all. `task_send_result` writes `RUN_DIR/result.md` and
emails it to your email from the sending account (General settings); `task_review_verdict` writes the
reviewer's verdict to `JOEY_VERDICT_FILE` for `task-run.ts` to read. `agent_done` (message + output-file list)
and `agent_message` (a note to the other agents) both append to `RUN_DIR/conversation.md` via
`conversation.ts` — the run's shared log agents leave for each other, shown on the run page and kept for review.
`agent_user_input` writes a question to `JOEY_QUESTION_FILE`; `task-run.ts` parks the run (`pending-input.ts`) until the
user answers on the run page, then resumes the same session with the answer. `agent_run` runs a one-shot sub-agent
(`runSubAgent` in `agent-session.ts`) with its own model and instructions and returns its reply (for supervisor agents).
The tools run in pi's process, cwd'd to
the task folder, so everything they need arrives as env (DB paths, `RUN_DIR`, `JOEY_AGENT`, …) and `index.ts` loads
`.env.local` itself. Adding a tool: a file here, a registration in `index.ts`, an entry in `tools.ts` (`conversation.ts`
is a shared helper, not a tool — the catalog test skips it).
`@earendil-works/pi-coding-agent` and `typebox` are devDependencies only for writing these, pinned to the
installed `pi`'s versions.

## UI — `app/`

Runs and the library are read-only views of the files and run history. A task can be started, paused,
**created** (the New task form writes a `tasks/<slug>.yaml`), **edited** (its yaml, in place) and **deleted**.
Settings stay editable.

- `/tasks`, `/tasks/[slug]`, `/tasks/new` — task files (state, last run); a task's errors, steps (each with its
  inline agent), raw yaml, runs, Start run, Pause/Resume schedule, **Edit** (the yaml, `PUT /api/tasks/[slug]`
  — saved straight to the file, errors don't block the save), **Delete** (`DELETE /api/tasks/[slug]` — removes
  the file and its paused state, refused while running; run history is kept), **Simulate** (the herdr + pi
  commands a run would issue — `POST`ed nowhere, from `GET /api/tasks/[slug]/simulate`). `/tasks/new` is a form
  that builds a task from prompts/scripts/models and `POST`s a structured `definition` to `/api/tasks` (validated before it's kept).
- `/runs`, `/runs/[id]` — every run; a run's steps (status, time, note, output), result, `conversation.md` and log,
  polling while it runs. A running step has a **Connect** button that streams its live `.log` over SSE
  (`GET /api/runs/[id]/steps/[idx]/stream`, an `EventSource`); each agent step appends its turns to
  `steps/NN-<agent>.log` for this (script steps redirect stdout there). When an agent calls `agent_user_input` the
  page shows an answer form; `POST /api/runs/[id]/answer` resumes the parked run.
- `/library/{scripts,prompts,skills,tools,mcp}` — `scripts/*/config.yaml`, `prompts/`, `skills/`, the tool
  catalog, `mcp.json` (env values never leave the server).
- `/settings/general`, `/settings/ssh`, `/integrations` — settings. SSH is the one CRUD resource left: a
  DataGrid list, `SidePanel` slide-over for view/create/edit, `ConfirmModal` for delete.
- `app/api/**/route.ts` — the HTTP API (`tasks`, `runs`, `library/*`, `tools`, `ssh`, `settings/*`). Settings
  routes stay under `app/api/settings/**` — renaming them would break registered OAuth redirect URIs.
- `app/components/` — `DataGrid` (ag-grid; row click navigates, ignores clicks on buttons inside cells),
  `SidePanel`, `ConfirmModal`, `SshForm`, `Sidebar`, `Topbar`, `ThemeToggle`. `app/lib/types.ts` duplicates the
  engine's client-facing shapes on purpose, so nothing server-only reaches the browser bundle.

The Google OAuth **callback URL** is `<origin>/api/settings/google/callback` for every service — the one
redirect URI to register on the Google Cloud client. `/api/settings/google/connect?service=gmail|youtube`
starts the flow; the CSRF `state` (`app/api/settings/_oauth-state.ts`) remembers which service started it.

## Gotchas (don't rediscover these)

- `data/*.db` are gitignored and created on first use; delete them to reset (settings.db holds the OAuth
  tokens and SSH secrets). `db.ts` creates tables with `CREATE TABLE IF NOT EXISTS`, which doesn't add a
  column to an existing table — add an `ALTER TABLE … ADD COLUMN` guarded by `PRAGMA table_info` rather than
  asking people to delete their databases.
- Turbopack won't build cleanly if a dynamic filesystem path (`db.ts`, `definitions.ts`, `templates.ts`, the
  API routes reading files) loses its `/* turbopackIgnore: true */` comment. It also refuses a symlinked
  `node_modules`.
- `startTaskRun` never awaits the steps; a run is created `running` with no await before it, and startup marks
  leftover `running` runs `interrupted` — otherwise a task would be blocked forever.
- herdr reports a finished pi turn as `done`, not `idle`: wait with herdr's defaults (idle/done/blocked), not
  `--until idle`. pi's reply is in its session JSONL, which can trail herdr's state by a moment (`ask` re-reads).
- herdr agent names must match `^[a-z][a-z0-9_-]{0,31}$` — build them with `herdrAgentName` (the fake herdr
  enforces the rule too); the readable `joey:<task>:<agent>` goes on the tab label.
- Never type a long line into a pane: the shell's prompt can land mid-typing and the command never runs.
  `runInPaneExit` (under every herdr command) writes the command to a 0600 temp file and types `. <file>`;
  since it's sourced, a top-level `exit` in a command would close the pane's shell.
- Check `pi --help` before adding a pi flag (`--thinking`, not `--thinking-level`; there's no skip-permissions
  flag). pi has no MCP of its own — `pi-mcp-adapter` (installed as a pi package) adds `--mcp-config`.
- Scripts, pi and its tools run in the herdr pane's shell: its `PATH` (not the app's), cwd = the task folder,
  no `.env.local` — pass what they need as env, and resolve repo paths absolutely.
