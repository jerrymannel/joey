# API Routes

## Table of Contents
- [Conventions](#conventions)
- [Tasks](#tasks)
- [Roles](#roles)
- [Runs](#runs)
- [Workers](#workers)
- [Polling Cadence](#polling-cadence)

## Conventions

All routes live under `app/api/` (Next.js Route Handlers, Node runtime —
required for `better-sqlite3`). JSON in, JSON out. No auth (single local
user, per [GAP.md](GAP.md) scope). Errors: `{ error: string }` with a 4xx/5xx
status.

## Tasks

| Method | Path | Body / Query | Response |
|---|---|---|---|
| `GET` | `/api/tasks` | — | `Task[]` |
| `POST` | `/api/tasks` | `{ name, folderPath }` | `Task` (detects `isGitRepo` server-side) |
| `GET` | `/api/tasks/:taskId` | — | `Task` |
| `PATCH` | `/api/tasks/:taskId` | `Partial<{ name, orchestratorGoal, secretsFilePath, maxParallelWorkers }>` | `Task` |
| `DELETE` | `/api/tasks/:taskId` | — | `204` |

`Task` shape mirrors `data.db`'s `tasks` table (see
[05_data-db-schema.md](05_data-db-schema.md)), camelCased.

## Roles

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/tasks/:taskId/roles` | — | `AgentRole[]` |
| `POST` | `/api/tasks/:taskId/roles` | `AgentRole` fields minus `id` | `AgentRole` |
| `PATCH` | `/api/tasks/:taskId/roles/:roleId` | `Partial<AgentRole>` | `AgentRole` |
| `DELETE` | `/api/tasks/:taskId/roles/:roleId` | — | `204` |

## Runs

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/tasks/:taskId/runs` | — | `Run[]` (history, newest first) |
| `POST` | `/api/tasks/:taskId/runs` | — | `{ runId }` — starts the orchestrator bootstrap (see [07_orchestrator-lifecycle.md](07_orchestrator-lifecycle.md)); returns immediately, does not wait for the run to finish |
| `GET` | `/api/tasks/:taskId/runs/:runId` | — | `RunDetail` — run status + all its `workers` rows + latest `status_events` per worker |

## Workers

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/workers/:workerId` | — | `WorkerDetail` — worker row + artifact content (if `awaiting_review`/`reviewed`) + reviewer's verdict (if any) + recent `status_events` |
| `POST` | `/api/workers/:workerId/approve-merge` | — | `Worker` — sets `merge_approved_at`, only valid when `status = 'reviewed'` |
| `GET` | `/api/workers/:workerId/attach-info` | — | `{ herdrPaneId, attachCommand: "herdr agent attach <pane>", recentOutput: string }` — used by the blocked banner |

## Polling Cadence

The run-monitor page polls `GET /api/tasks/:taskId/runs/:runId` every 3s
while `run.status = 'running'`, stopping once it's `completed`/`failed`.
The task list and task config pages do not poll — they're static until the
user navigates or submits a form. This is the accepted trade-off for
"polling only" from [GAP.md](GAP.md): no push, small fixed interval, only
active on the one page where staleness actually matters.
