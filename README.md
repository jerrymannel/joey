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
`search_emails`/`read_email`/`list_playlists`/`show_playlist_contents`, not
just read about them in the prompt — see `pi-tools/` and `harness.ts` in
[AGENTS.md](AGENTS.md) for how.

`pi` types its command into your own shell, so it only sees env vars your
shell already has exported — not `.env.local`, which only Next.js reads.
`SETTINGS_ENCRYPTION_KEY` (decrypts the stored Google tokens `pi-tools`
needs) must be exported in your shell profile with the same value as
`.env.local`, or every pi-tools call fails with `SETTINGS_ENCRYPTION_KEY env
var is required...`.

To run `pi` with these tools yourself, outside the app:

```bash
DATA_DB_PATH="$(pwd)/data/data.db" pi --extension ./pi-tools/index.ts
```

`DATA_DB_PATH` matters here too: without it, `pi` looks for `data/data.db`
relative to wherever you ran it from instead of this repo's real database.

## Resetting local state

`data/data.db` and `data/logs.db` are gitignored and recreated automatically on
first use — safe to delete anytime to start over. `data.db` holds tasks and
Gmail/YouTube settings (OAuth clients + connected accounts + playlist ID);
`logs.db` holds run history.

Full reset (also clears Gmail/YouTube settings — you'll need to reconnect accounts):

```bash
rm -f data/data.db data/data.db-wal data/data.db-shm data/logs.db data/logs.db-wal data/logs.db-shm
```

Reset tasks and run history but keep Gmail settings:

```bash
rm -f data/logs.db data/logs.db-wal data/logs.db-shm
sqlite3 data/data.db "DELETE FROM tasks;"
```

Restart the dev server after either so it reopens the databases.
