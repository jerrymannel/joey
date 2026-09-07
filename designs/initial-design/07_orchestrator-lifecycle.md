# Orchestrator Lifecycle

## Table of Contents
- [Bootstrap](#bootstrap)
- [pi-tool.ts Tool Contract](#pi-toolts-tool-contract)
- [Prompt Construction](#prompt-construction)
- [Merge Execution](#merge-execution)

## Bootstrap

Triggered by `POST /api/tasks/:taskId/runs` (see
[11_api-routes.md](11_api-routes.md)). The Next.js backend:

1. Inserts a `runs` row (`status = 'pending'`).
2. `herdr workspace create --cwd <task.folder_path> --label run-<runId>`
3. `herdr tab create --workspace <ws_id> --cwd <task.folder_path> --label orchestrator --env TASK_ID=<taskId> --env RUN_ID=<runId> --env DATA_DB_PATH=<abs path> --env LOGS_DB_PATH=<abs path>`
4. `herdr pane run <pane_id> "pi -e <abs path to src/extension/pi-tool.ts>"`
5. `herdr agent prompt <pane_id> <assembled prompt> --wait` is **not**
   awaited synchronously by the HTTP request — the backend returns
   immediately with `runId`, and the UI starts polling
   `GET /api/tasks/:taskId/runs/:runId`.
6. Updates `runs.status = 'running'`, `runs.herdr_workspace_id`.

`pi-tool.ts` reads `TASK_ID`/`RUN_ID`/`DATA_DB_PATH`/`LOGS_DB_PATH` from
`process.env` on init and opens both SQLite files directly (via
`src/engine/db.ts`) — the same module the Next.js backend uses.

## pi-tool.ts Tool Contract

Registered with `pi.registerTool()` (see
[02_external-tool-contracts.md](02_external-tool-contracts.md)) — these are
the only tools this Pi instance has beyond its built-ins, and the **only**
place in the whole system that can call Herdr's spawn-related methods.

| Tool | Params | Behavior |
|---|---|---|
| `list_roles` | — | Returns the task's `agent_roles` rows (name, prompt, is_reviewer) from `data.db` |
| `spawn_worker` | `roleId` | Refuses if `active worker count >= max_parallel_workers` (queues by returning a "try later" result). Otherwise: creates worktree (git tasks) or uses task folder (non-git), creates Herdr tab with role's env file, inserts `workers` row, sends the role's `system_prompt` + artifact path instructions |
| `check_worker_status` | `workerId` | Returns current `workers.status` + latest `status_events` row |
| `read_artifact` | `workerId` | Reads and returns the worker's artifact file content, after validating it against `agent_roles.artifact_schema` |
| `run_reviewer` | `workerId` | Spawns the task's reviewer role in the same worktree as `workerId` (see [09_review-and-merge.md](09_review-and-merge.md)) |
| `check_merge_approved` | `workerId` | Reads `workers.merge_approved_at`; returns whether it's set |
| `complete_merge` | `workerId` | Called after the orchestrator's bash tool has run `git merge` successfully; updates `workers.merged_at`, `runs.status` if this was the last worker |

`spawn_worker`/`run_reviewer` are the only tools that call
`src/herdr/client.ts`; all others are pure `data.db`/`logs.db` reads/writes.

## Prompt Construction

The orchestrator's first prompt = `tasks.orchestrator_goal` verbatim,
followed by a generated block listing each non-reviewer role's `name` and a
one-line summary of its `system_prompt`, and an instruction to use
`spawn_worker`/`check_worker_status`/`read_artifact`/`run_reviewer` to get
work done, respecting `max_parallel_workers`. No structured template beyond
this — freeform text is the chosen authoring UX (see [GAP.md](GAP.md)).

## Merge Execution

The orchestrator's own bash tool (not `pi-tool.ts`) runs `git merge` — this
is deliberate: the tool contract above has no `merge` tool, because merging
is plain git the orchestrator can already do with its built-in bash access
once it has confirmed `check_merge_approved` returns true. Sequence, driven
by the orchestrator's own reasoning loop:

1. Poll `check_merge_approved(workerId)` for each `awaiting_merge` worker.
2. On true: `git merge <branch_name>` in the main checkout (bash tool).
3. On success: call `complete_merge(workerId)`, then remove the worktree
   and delete the branch (via bash, or a dedicated tool if this proves
   error-prone in practice — flagged as an implementation detail to revisit).
4. On conflict: leave the worktree/branch intact, report the conflict in
   its own status (surfaced to the human via `status_events`), do not
   retry automatically.
