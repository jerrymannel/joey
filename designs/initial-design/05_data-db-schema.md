# data.db Schema

## Table of Contents
- [Purpose](#purpose)
- [Tables](#tables)
  - [tasks](#tasks)
  - [agent_roles](#agent_roles)
- [Relationships](#relationships)

## Purpose

`data.db` holds configuration: what a task is, and what sub-agent roles it
can spawn. Written by the UI (task/role CRUD), read by both the Next.js
backend and the orchestrator's `pi-tool.ts` at run start. Not written to
during a run — see [06_logs-db-schema.md](06_logs-db-schema.md) for that.

## Tables

### tasks

```sql
CREATE TABLE tasks (
  id                    TEXT PRIMARY KEY,       -- uuid
  name                  TEXT NOT NULL,
  folder_path           TEXT NOT NULL UNIQUE,   -- absolute path
  is_git_repo           INTEGER NOT NULL,        -- 0/1, detected at save time
  orchestrator_goal     TEXT NOT NULL DEFAULT '', -- freeform prompt text
  secrets_file_path     TEXT,                    -- absolute path to .env-style file
  max_parallel_workers  INTEGER NOT NULL DEFAULT 3,
  created_at            TEXT NOT NULL,           -- ISO 8601
  updated_at            TEXT NOT NULL
);
```

- `is_git_repo` is re-checked and updated whenever the task is opened, in
  case the folder's git status changed since configuration.
- `orchestrator_goal` is injected verbatim as the orchestrator's first
  prompt, alongside a generated summary of `agent_roles` for that task (see
  [07_orchestrator-lifecycle.md](07_orchestrator-lifecycle.md)).

### agent_roles

```sql
CREATE TABLE agent_roles (
  id                TEXT PRIMARY KEY,           -- uuid
  task_id           TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,              -- e.g. "implementer", "reviewer"
  is_reviewer       INTEGER NOT NULL DEFAULT 0, -- 0/1, marks the reviewer role
  system_prompt     TEXT NOT NULL,              -- injected as the worker's first prompt
  provider          TEXT NOT NULL,              -- e.g. "anthropic"
  model             TEXT NOT NULL,              -- e.g. "claude-sonnet-5"
  tools_allowlist   TEXT,                       -- JSON array of tool names, NULL = Pi defaults
  tools_denylist    TEXT,                       -- JSON array, NULL = none
  artifact_path     TEXT NOT NULL,              -- relative to worker's worktree, e.g. "artifacts/report.md"
  artifact_schema   TEXT,                       -- JSON: {required: [...], fields: {name: "string"|"number"|"boolean"}}
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
```

- Exactly one row per task should have `is_reviewer = 1`; enforced at the
  application layer (not a DB constraint, to keep migrations simple).
- `tools_allowlist`/`tools_denylist` map to Pi's `--tools`/`--exclude-tools`
  flags (see [02_external-tool-contracts.md](02_external-tool-contracts.md)).
- `artifact_schema` is consumed by the hand-rolled validator in
  `src/engine/artifact.ts` — see
  [08_worker-lifecycle.md](08_worker-lifecycle.md).

## Relationships

`tasks 1--N agent_roles`, cascade delete. There is no `orchestrator_configs`
table: the orchestrator has no separate role row — its behavior comes from
`tasks.orchestrator_goal` plus the full `agent_roles` roster for that task,
which `pi-tool.ts` reads at bootstrap.
