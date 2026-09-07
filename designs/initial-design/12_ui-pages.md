# UI Pages and Components

## Table of Contents
- [Pages](#pages)
- [Key Components](#key-components)

## Pages

### `/tasks` — Task List
Table of configured tasks (name, folder path, git/non-git badge, last run
status). "New Task" form: name + folder path only (goal/roles/secrets are
configured after creation, on the task page). Row click → `/tasks/:taskId`.

### `/tasks/:taskId` — Task Config
- Folder path (read-only after creation), git/non-git badge.
- `orchestratorGoal` textarea (freeform, per [GAP.md](GAP.md)).
- `secretsFilePath` text field (just a path — the file itself is edited
  outside the app, per the accepted secrets design).
- `maxParallelWorkers` number field (disabled, forced to 1, for non-git
  tasks — see [10_non-git-sequential-mode.md](10_non-git-sequential-mode.md)).
- Role roster editor (add/edit/delete `AgentRole` rows): name, reviewer
  toggle, system prompt, provider/model, tools allowlist/denylist, artifact
  path, artifact schema (simple key/type rows, not raw JSON entry).
- Run history list (links to `/tasks/:taskId/runs/:runId`) + "Start Run"
  button (disabled while a run for this task is already `running`).

### `/tasks/:taskId/runs/:runId` — Run Monitor
- Run status header (`pending`/`running`/`completed`/`failed`).
- One `WorkerStatusCard` per worker (including reviewers, visually grouped
  under the worker they reviewed).
- Polls per [11_api-routes.md](11_api-routes.md).

## Key Components

**`WorkerStatusCard`**
- Role name, current status badge, elapsed time.
- If `blocked`: renders `BlockedBanner`.
- If `awaiting_review`/`reviewed`: shows artifact content (rendered as
  Markdown or a key/value table depending on whether `artifact_schema` was
  set) and, once reviewed, the reviewer's verdict artifact inline.
- If `reviewed` (git tasks only): renders `MergeApprovalButton`.
- If `failed`: shows `artifact_message` from `done.json`, or "no
  done.json / artifact found" if that's why it failed.

**`BlockedBanner`**
- Fetches `attach-info`, shows `recentOutput` (last N lines) and the
  `attachCommand` in a copyable code block, with a one-line explanation
  that this needs to be run in the user's own terminal (see
  [02_external-tool-contracts.md](02_external-tool-contracts.md) —
  `herdr agent attach` attaches the caller's terminal, which a browser
  tab cannot do on the user's behalf).

**`MergeApprovalButton`**
- Calls `approve-merge`; disables itself and shows "waiting for
  orchestrator to merge…" until the worker's status becomes `merged`
  (observed via the next poll) or a conflict is reported in
  `status_events`.

**`RoleEditor`**
- Form for one `AgentRole`; the artifact-schema sub-form is a small
  repeatable `{ fieldName, type, required }` list, translated to/from the
  `ArtifactSchema` JSON shape in [08_worker-lifecycle.md](08_worker-lifecycle.md)
  — no raw JSON editing exposed in v1.
