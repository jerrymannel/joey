# logs.db Schema

## Table of Contents
- [Purpose](#purpose)
- [Tables](#tables)
  - [runs](#runs)
  - [workers](#workers)
  - [status_events](#status_events)
- [State Machines](#state-machines)

## Purpose

`logs.db` holds everything about run execution: one row per run, one row
per spawned worker (including reviewers — a reviewer is just a worker whose
`agent_roles.is_reviewer = 1`), and an append-only event log used for the
UI's polling views and post-hoc debugging.

## Tables

### runs

```sql
CREATE TABLE runs (
  id                TEXT PRIMARY KEY,           -- uuid, this is Herdr's workspace label too
  task_id           TEXT NOT NULL,              -- data.db tasks.id (cross-db, app-level FK)
  herdr_workspace_id TEXT,                      -- set once the workspace is created
  status            TEXT NOT NULL,              -- see State Machines
  started_at        TEXT NOT NULL,
  ended_at          TEXT
);
```

### workers

```sql
CREATE TABLE workers (
  id                TEXT PRIMARY KEY,           -- uuid
  run_id            TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  role_id           TEXT NOT NULL,              -- data.db agent_roles.id
  role_name         TEXT NOT NULL,              -- denormalized for display after role edits
  worktree_path     TEXT,                       -- NULL for non-git tasks (cwd = task folder)
  branch_name       TEXT,                       -- NULL for non-git tasks
  herdr_pane_id     TEXT,
  status            TEXT NOT NULL,              -- see State Machines
  artifact_success  INTEGER,                    -- from done.json, NULL until reported
  artifact_message  TEXT,                       -- from done.json
  reviewed_worker_id TEXT REFERENCES workers(id), -- set on reviewer rows: which worker it reviewed
  merge_approved_at TEXT,                       -- set when the human clicks Merge
  merged_at         TEXT,                       -- set when the orchestrator completes the merge
  started_at        TEXT NOT NULL,
  ended_at          TEXT
);
```

### status_events

```sql
CREATE TABLE status_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id   TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,                    -- herdr agent_status value at time of event
  detail      TEXT,                             -- e.g. pane read excerpt for blocked events
  occurred_at TEXT NOT NULL
);
```

- Populated as the orchestrator's monitoring loop observes
  `pane.agent_status_changed` events or `agent.wait` results for each
  worker pane. This is the append-only trail the UI's run-monitor page
  reads to render a timeline, and it's how a `blocked` banner gets its
  pane-output excerpt without a live terminal connection.

## State Machines

**runs.status**: `pending` → `running` → one of `completed`, `failed`,
`interrupted` (crash/restart, see
[13_concurrency-and-failure-handling.md](13_concurrency-and-failure-handling.md)).

**workers.status**: `pending` → `spawning` → `working` ⇄ `idle` (Herdr's raw
states) → `awaiting_review` (worker done, `success:true`) or `failed`
(worker done, `success:false`, or done.json never appeared) → for
reviewable workers, `reviewed` → `awaiting_merge` → `merged`. A `blocked`
status can occur from any of `spawning`/`working`/`idle` and returns to the
prior state once the pane is unblocked (see
[09_review-and-merge.md](09_review-and-merge.md) and
[13_concurrency-and-failure-handling.md](13_concurrency-and-failure-handling.md)
for how `blocked` is surfaced).
