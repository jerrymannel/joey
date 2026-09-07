# Worker Lifecycle

## Table of Contents
- [Spawn Sequence](#spawn-sequence)
- [done.json Contract](#donejson-contract)
- [Artifact Contract](#artifact-contract)
- [Status Transitions](#status-transitions)

## Spawn Sequence

Driven by `pi-tool.ts`'s `spawn_worker(roleId)` (see
[07_orchestrator-lifecycle.md](07_orchestrator-lifecycle.md)):

1. **Git tasks**: `src/engine/worktree.ts` runs
   `git worktree add ../wt-<taskId>-<workerId> worker-<taskId>-<workerId>`
   relative to the task's main checkout. **Non-git tasks**: worktree step
   skipped, worker's `--cwd` = task folder directly (sequential — see
   [10_non-git-sequential-mode.md](10_non-git-sequential-mode.md)).
2. `src/engine/secrets.ts` parses the task's `.env`-style secrets file into
   a list of `--env KEY=VALUE` args.
3. `herdr tab create --workspace <ws_id> --cwd <worktree_or_task_path> --label <role.name> --env ...`
4. `herdr pane run <pane_id> "pi"` (plain, no `-e` — no custom extension).
   `--tools`/`--exclude-tools` from `agent_roles.tools_allowlist`/
   `tools_denylist` are appended to this command.
5. `herdr agent prompt <pane_id> <role.system_prompt + handoff instructions>`
   — the handoff instructions tell the worker exactly what to write to
   `agent_roles.artifact_path` and to finish by writing
   `.orchestrator/done.json` as its last action.
6. Insert a `workers` row (`status = 'spawning'`, then `'working'` once the
   pane reports that state).

## done.json Contract

Written by the worker itself, at `<worktree>/.orchestrator/done.json`:

```json
{ "success": true, "message": "Implemented the feature, tests pass." }
```

or

```json
{ "success": false, "message": "Could not reproduce the failing test; stopped." }
```

The orchestrator only trusts this file once the pane has also transitioned
from `working` to `idle` (see [03_system-architecture.md](03_system-architecture.md)
step 4) — a `done.json` written mid-task by a confused prompt without the
pane actually going idle is not treated as completion.

## Artifact Contract

`agent_roles.artifact_path` (relative to the worktree) must exist and, if
`agent_roles.artifact_schema` is set, pass the minimal validator in
`src/engine/artifact.ts`:

```ts
type ArtifactSchema = {
  required: string[];
  fields: Record<string, "string" | "number" | "boolean">;
};
// validate(content: unknown, schema: ArtifactSchema): { ok: true } | { ok: false; errors: string[] }
```

The artifact is expected to be JSON when a schema is set; a role with no
`artifact_schema` may produce freeform Markdown (e.g. a report), read
as-is by `read_artifact`.

## Status Transitions

`pending` → `spawning` → `working` ⇄ `idle` (raw Herdr states, logged to
`status_events`) → on first working→idle after the prompt:
- `done.json` present, `success: true`, artifact valid → `awaiting_review`
- `done.json` present, `success: false` → `failed`
- `done.json` missing or artifact invalid → `failed`

`blocked` can interrupt `spawning`/`working`/`idle` at any point (Herdr
reports it independently of the completion protocol above) — see
[13_concurrency-and-failure-handling.md](13_concurrency-and-failure-handling.md).
