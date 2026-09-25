# joey

Control panel for simple, schedulable agent tasks — see [AGENTS.md](AGENTS.md).

## Connecting Gmail/YouTube

Both integrations share one Google OAuth flow. On the Integrations page,
create a Google Cloud OAuth client with an Authorized redirect URI of
`<this app's URL>/api/settings/google/callback` (e.g.
`http://localhost:3000/api/settings/google/callback` in dev), paste its
Client ID/Secret in, then "Connect account" for Gmail and/or YouTube.

## Tasks

A task is a `tasks/<name>.yaml` file: agents (a prompt from `prompts/`, a pi model, tools, MCP servers from
`mcp.json`) and an ordered list of steps — scripts from `scripts.yaml` and agent turns, with optional review
loops. `tasks/inbox-digest.yaml` is a worked example; [docs/redesign.md](docs/redesign.md) has the full format.
Start one from its page in the app or with:

```bash
npm run start-run -- inbox-digest
```

Every agent is an interactive `pi` in a herdr tab (you can watch or type into it) with `pi-tools/index.ts`
loaded, so it can call Joey's tools. Each run gets a folder under the workspace folder (General settings) with
every step's output, the agents' pi sessions and `result.md`.

`pi` and the scripts run in your own shell, which doesn't see `.env.local` (only Next.js reads it), so
`pi-tools/index.ts` and `scripts/joey.ts` load `SETTINGS_ENCRYPTION_KEY` (it decrypts the stored settings and
Google tokens) from `.env.local` themselves. An exported variable in your shell wins over the file.

## Transcription (Whisper)

Audio transcription (the `transcribe-folder` and `youtube-playlist` scripts, and the
`whisper_transcribe_audio` pi tool) shells out to the [`whisper`](https://github.com/openai/whisper) CLI, so it
has to be installed and on the `PATH` of your herdr shell (every command Joey runs — whisper, ssh, scripts, `pi`, `yt-dlp` — runs in a herdr tab). It also needs `ffmpeg`.

`pip install -U openai-whisper` fails on a Homebrew (or system) Python with
`externally-managed-environment` (PEP 668) — don't force it with
`--break-system-packages`. Install it as an isolated tool with
[uv](https://docs.astral.sh/uv/) instead:

```bash
brew install ffmpeg uv          # skip whichever you already have
uv tool install openai-whisper  # puts `whisper` in ~/.local/bin
```

Check it, and make sure `~/.local/bin` is on your `PATH` (`uv tool update-shell`
adds it), then restart the dev server so it sees the new `PATH`:

```bash
whisper --help
```

Without uv, `pipx install openai-whisper` (`brew install pipx`) does the same, or
make a virtualenv (`python3 -m venv .venv && .venv/bin/pip install -U openai-whisper`)
and point `JOEY_WHISPER_BIN` at `.venv/bin/whisper`.

The first run of each model downloads it (`tiny` ≈ 75 MB, `base` ≈ 140 MB, up to
`large` ≈ 3 GB) to `~/.cache/whisper`. Optional environment variables (put them in
`.env.local`):

- `JOEY_WHISPER_MODEL` — model to use, default `base` (`tiny`, `base`, `small`, `medium`, `large`; bigger is slower and more accurate).
- `JOEY_WHISPER_BIN` — path of the `whisper` binary, if it isn't on the `PATH`.

The `transcribe-folder` script writes `<file name>.transcribed.txt` next to each matching
audio file, and lists every transcript's path in `transcribed-files.txt` at the
folder's root.

## Resetting local state

Three databases in `data/`, gitignored and recreated automatically on first use —
safe to delete anytime to start over:

- `data.db` — task state (paused schedules); the tasks themselves are `tasks/*.yaml`.
- `settings.db` — Settings (workspace folder, Google OAuth clients and connected accounts,
  the result sender, your email) and SSH servers.
- `logs.db` — run history (the run folders themselves stay in the workspace).

Full reset (also clears settings — you'll need to reconnect Google accounts):

```bash
rm -f data/data.db* data/settings.db* data/logs.db*
```

Reset run history and task state but keep settings:

```bash
rm -f data/data.db* data/logs.db*
```

Restart the dev server after either so it reopens the databases.
