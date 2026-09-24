# joey

Control panel for simple, schedulable agent tasks — see [AGENTS.md](AGENTS.md).

## Connecting Gmail/YouTube

Both integrations share one Google OAuth flow. On the Integrations page,
create a Google Cloud OAuth client with an Authorized redirect URI of
`<this app's URL>/api/settings/google/callback` (e.g.
`http://localhost:3000/api/settings/google/callback` in dev), paste its
Client ID/Secret in, then "Connect account" for Gmail and/or YouTube.

## Running `pi` tasks/automations

Any Task or Gmail/YouTube automation set to the `pi` harness runs the `pi`
CLI inside a herdr tab, with `pi-tools/index.ts` loaded automatically
(`--extension`) so the LLM can actually call
`gmail_search_emails`/`gmail_read_email`/`youtube_list_playlists`/`youtube_show_playlist_contents`, not
just read about them in the prompt — see `pi-tools/` and `harness.ts` in
[AGENTS.md](AGENTS.md) for how.

`pi` types its command into your own shell, which doesn't see `.env.local`
(only Next.js reads it), so `pi-tools/index.ts` loads `SETTINGS_ENCRYPTION_KEY`
(it decrypts the stored settings and Google tokens) from `.env.local` itself.
An exported variable in your shell wins over the file.

To run `pi` with these tools yourself, outside the app:

```bash
DATA_DB_PATH="$(pwd)/data/data.db" pi --extension ./pi-tools/index.ts
```

`DATA_DB_PATH` matters here too: without it, `pi` looks for `data/data.db`
(and `data/settings.db`, which sits beside it) relative to wherever you ran it
from instead of this repo's real databases.

## Transcription (Whisper)

Audio transcription (Automations → Transcription, and the `whisper_transcribe_audio`
pi tool) shells out to the [`whisper`](https://github.com/openai/whisper) CLI, so it
has to be installed and on the `PATH` of your herdr shell (every command Joey runs — whisper, ssh, `claude`/`agy`, `pi`, `yt-dlp` — runs in a herdr tab). It also needs `ffmpeg`.

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

A transcription automation writes `<file name>.transcribed.txt` next to each matching
audio file, and lists every transcript's path in `transcribed-files.txt` at the
folder's root.

## Resetting local state

Three databases in `data/`, gitignored and recreated automatically on first use —
safe to delete anytime to start over:

- `data.db` — the tasks.
- `settings.db` — Settings (workspace/results folders, Google OAuth clients and connected
  accounts, mailbox, your email) and Configurations (models, prompts, SSH servers, tools).
- `logs.db` — run history.

Full reset (also clears settings — you'll need to reconnect Google accounts):

```bash
rm -f data/data.db* data/settings.db* data/logs.db*
```

Reset tasks and run history but keep settings:

```bash
rm -f data/data.db* data/logs.db*
```

Restart the dev server after either so it reopens the databases.
