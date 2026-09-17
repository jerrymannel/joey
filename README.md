# joey

Control panel for simple, schedulable agent tasks — see [AGENTS.md](AGENTS.md).

## Connecting Gmail/YouTube

Both integrations share one Google OAuth flow. On the Integrations page,
create a Google Cloud OAuth client with an Authorized redirect URI of
`<this app's URL>/api/settings/google/callback` (e.g.
`http://localhost:3000/api/settings/google/callback` in dev), paste its
Client ID/Secret in, then "Connect account" for Gmail and/or YouTube.

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
