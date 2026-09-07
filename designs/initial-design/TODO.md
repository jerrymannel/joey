# TODO

## Table of Contents
- [0. Pre-work](#0-pre-work)
- [1. Project Scaffold](#1-project-scaffold)
- [2. Databases](#2-databases)
- [3. Herdr Client](#3-herdr-client)
- [4. Engine](#4-engine)
- [5. Orchestrator Extension](#5-orchestrator-extension)
- [6. API Routes](#6-api-routes)
- [7. UI](#7-ui)
- [8. Non-Git Mode](#8-non-git-mode)
- [9. Manual End-to-End Test Plan](#9-manual-end-to-end-test-plan)

## 0. Pre-work
- [x] Install Herdr and Pi locally; run `herdr api schema --json` and
      `pi --help` / `pi --mode rpc --help` to confirm the CLI surface
      documented in [02_external-tool-contracts.md](02_external-tool-contracts.md)
      still matches (see [GAP.md](GAP.md) item 1). Confirmed: `herdr workspace
      create`/`tab create` both take `--env KEY=VALUE`; `herdr agent start
      <name> --kind pi --pane <id> -- <extra args>` launches Pi in an
      existing pane *and* registers it as a tracked agent in one step
      (cleaner than the doc's separate `pane run` + implicit registration).
      `client.ts` uses this. Everything else matches the design as written.
- [x] `herdr integration install pi` once, globally, on the dev machine.

## 1. Project Scaffold
- [x] Hand-scaffolded Next.js (App Router, TS, Turbopack) into this repo —
      `create-next-app` refuses non-empty directories and this repo already
      has `designs/`, `NOTES.md`, etc.; a manual `package.json`/`tsconfig.json`/
      `next.config.ts` gave exact control over the `app/` + `src/` layout
      [04_folder-structure.md](04_folder-structure.md) requires.
- [x] Add `better-sqlite3` (verified native binding loads on Node v26).
- [x] `.gitignore`: `/data/`, `*.herdr.env`.

## 2. Databases — [05](05_data-db-schema.md) / [06](06_logs-db-schema.md)
- [x] `src/engine/db.ts`: open `data.db`/`logs.db`, enable WAL mode +
      `foreign_keys` (required for `ON DELETE CASCADE` on `better-sqlite3`),
      run `CREATE TABLE IF NOT EXISTS` migrations for all tables in both
      docs. Self-check: `src/engine/db.test.ts`.
- [x] No seed script needed — task creation is a UI/API path (`POST
      /api/tasks`), covered in section 6/7.

## 3. Herdr Client — [02](02_external-tool-contracts.md)
- [x] `src/herdr/types.ts`: agent-state + create-result types.
- [x] `src/herdr/client.ts`: thin `child_process.execFile` wrapper over the
      CLI (chosen over raw socket JSONL — the CLI mirrors the socket API
      1:1 and needs no framing/correlation logic). Wraps `workspace create`,
      `tab create`, `agent start` (launches Pi *and* registers the pane as
      a tracked agent in one call — replaces the doc's separate `pane run`
      + implicit-registration flow), `agent prompt`, `agent get`/`agent
      wait`, `agent read`, and `attachCommand` (command-string builder
      only, never executed). Verified live against a locally-run `herdr
      server`: JSON envelope is `{id, result}`/`{id, error}` for control
      commands; `agent read`/`pane read` return raw terminal text, not
      JSON; `--source visible` is what's reliably populated for a
      short-lived pane (`recent`/`recent-unwrapped` were empty in
      practice); agent names must match `^[a-z][a-z0-9_-]{0,31}$` and only
      need to be unique among *live* agents — since every agent command
      also accepts a raw pane ID as `target`, the DB only needs to persist
      `herdr_pane_id` (matches the documented schema, no extra column).

## 4. Engine — [04](04_folder-structure.md)
- [x] `worktree.ts`: `git worktree add`/`remove`, branch naming
      `worker-<taskId>-<workerId>`. Self-check: `worktree.test.ts`.
- [x] `task-board.ts`: CRUD over `tasks`/`agent_roles`.
- [x] `run-log.ts`: CRUD over `runs`/`workers`/`status_events`.
- [x] `artifact.ts`: `done.json` reader + minimal schema validator —
      [08](08_worker-lifecycle.md). Self-check: `artifact.test.ts`.
- [x] `secrets.ts`: `.env`-style file parser — [13](13_concurrency-and-failure-handling.md).
      Self-check: `secrets.test.ts`. (Returns a `Record<string,string>`;
      `client.ts`'s `envArgs()` does the `--env KEY=VALUE` flattening, so
      the parsing and the CLI-arg shape aren't coupled in one function.)

## 5. Orchestrator Extension — [07](07_orchestrator-lifecycle.md)
- [x] `src/extension/pi-tool.ts`: register `list_roles`, `spawn_worker`,
      `check_worker_status`, `read_artifact`, `run_reviewer`,
      `check_merge_approved`, `complete_merge`, and one addition beyond the
      documented contract: **`finish_run`**. Nothing in the documented tool
      table ever moves `runs.status` out of `running` for the non-git path
      (no merge step exists there) or for the "human never merges" edge
      case in git mode — without an explicit tool, a run could never reach
      `completed`/`failed`. `finish_run` is a one-line `updateRunStatus`
      call the orchestrator's prompt tells it to call last, once it has no
      more spawn/review/merge work left to drive — same "LLM decides, tool
      doesn't queue on its behalf" philosophy already used for the
      `spawn_worker` capacity check.
- [x] Verified against real Pi (not just `tsc`): loading via
      `pi -e ./src/extension/pi-tool.ts` with `TASK_ID`/`RUN_ID` unset
      surfaces our own guard error; with a seeded task row it loads and
      registers all tools cleanly, failing only at the expected
      "no API key" step (past all extension init).
- [x] Grounded the extension API itself against
      `@earendil-works/pi-coding-agent`'s bundled `docs/extensions.md` and
      `examples/extensions/*.ts` (installed locally at v0.85.1) rather than
      guessing: `pi.registerTool()` takes a plain object (no `defineTool`
      wrapper needed), parameters use `typebox`'s `Type`, and — important
      correction — string enums must use `StringEnum` from
      `@earendil-works/pi-ai`, not `Type.Union`/`Type.Literal`, which the
      docs explicitly call out as broken on Google's API (relevant since
      the orchestrator's own model isn't pinned to a provider — it runs
      under Pi's ambient default).
- [x] Concurrency cap check inside `spawn_worker` — [13](13_concurrency-and-failure-handling.md).
      (Not duplicated in `run_reviewer` — the doc scopes the cap check to
      `spawn_worker` specifically.)
- [x] `-e` flag usage keeps this extension out of every worker's Pi
      invocation by construction: `spawn_worker`/`run_reviewer` call
      `agentStart` with only `--tools`/`--exclude-tools` args, never `-e`;
      only the orchestrator's own bootstrap (section 6) passes `-e
      pi-tool.ts`.

## 6. API Routes — [11](11_api-routes.md)
- [x] `/api/tasks` (GET/POST), `/api/tasks/:id` (GET/PATCH/DELETE — GET
      re-checks `isGitRepo` per [10](10_non-git-sequential-mode.md); PATCH
      server-enforces `maxParallelWorkers = 1` for non-git tasks, not just
      a disabled UI field).
- [x] `/api/tasks/:id/roles` (GET/POST), `/api/tasks/:id/roles/:roleId` (PATCH/DELETE).
- [x] `/api/tasks/:id/runs` (GET/POST — POST 409s if a run for the task is
      already `pending`/`running`, calls `src/index.ts`'s shared `startRun`),
      `/api/tasks/:id/runs/:runId` (GET, includes each worker's latest
      status event).
- [x] `/api/workers/:id` (GET — includes artifact content once visible, the
      linked reviewer + its verdict via `findReviewerFor`, and the full
      status-event trail), `/approve-merge` (POST, 409 unless `status ===
      "reviewed"`), `/attach-info` (GET).
- [x] Startup hook: `instrumentation.ts`'s `register()` calls
      `markStaleRunsInterrupted()` — [13](13_concurrency-and-failure-handling.md).
- [x] **Bug found and fixed during smoke testing**: `startRun` created the
      `runs` row before the Herdr calls; if `workspace create`/`tab
      create`/`agent start` threw (e.g. herdr server not running), the row
      stayed `pending` forever — and the "already active" guard in the POST
      route treats `pending` as active, so a task would be permanently
      unable to start a new run after one bootstrap failure. Fixed by
      wrapping the bootstrap in try/catch and marking the run `failed`
      before rethrowing.
- [x] Full smoke test against a real `herdr server` (no API keys present in
      the shell, so no LLM cost risked): created a task + role via the API,
      `POST /api/tasks/:id/runs` actually created a live Herdr
      workspace/tab/pane, launched `pi -e pi-tool.ts`, and
      `herdr agent read` confirmed both `herdr-agent-state.ts` (global
      integration) and `pi-tool.ts` loaded together and the agent reported
      `idle` correctly — it only stopped at "no API key found", well past
      everything this phase needed to prove. Cleaned up the workspace,
      stopped the test `herdr server`, and reset `data/` afterward so no
      smoke-test data was left behind.

## 7. UI — [12](12_ui-pages.md)
- [x] `/tasks` list (name, folder, git badge, **last run status** — one
      extra `GET .../runs` per task client-side to fill that column; fine
      at local-single-user scale) + create form.
- [x] `/tasks/:id` config page (goal, secrets path, max-parallel — disabled
      *and* the PATCH route clamps it server-side for non-git tasks, role
      roster editor, run history + Start Run button disabled while a run
      is `pending`/`running`).
- [x] `/tasks/:id/runs/:runId` monitor page, 3s polling via `setInterval`,
      stops once the run leaves `pending`/`running`. Reviewer worker rows
      (`reviewedWorkerId` set) are filtered out of the top-level list and
      instead rendered nested inside the card of the worker they reviewed,
      per the doc's "visually grouped under" instruction.
- [x] Components: `WorkerStatusCard`, `BlockedBanner`, `MergeApprovalButton`,
      `RoleEditor` — all under `app/components/`. Shared `fetch` wrapper
      (`app/lib/api.ts`) and client-facing types (`app/lib/types.ts`,
      deliberately separate from `src/engine/*`'s server types so nothing
      server-only risks getting pulled into the client bundle).
- [x] Verified: `tsc --noEmit` and `next build` both clean (all 3 pages +
      10 API routes compiled). The Chrome extension needed for interactive
      browser testing wasn't connected in this environment, so verification
      was HTTP-level instead: started `next dev`, confirmed `/tasks`,
      `/tasks/:id`, and `/tasks/:id/runs/:runId` all return 200 with no
      server-error markers in the HTML (including for a nonexistent task
      id, which the client component handles itself rather than crashing
      the server), and re-ran the full create-task → add-role →
      start-a-real-run flow from phase 6 through these pages' own API
      calls. **Recommend an interactive pass in a real browser before
      relying on this UI day to day** — HTTP-level checks can't catch
      layout/interaction bugs a click-through would.

## 8. Non-Git Mode — [10](10_non-git-sequential-mode.md)
- [x] `is_git_repo` detection on task create (section 6) and re-checked on
      every task open (`GET /api/tasks/:id`).
- [x] `spawn_worker` skips `worktree.ts` and uses `task.folderPath` directly
      when `!task.isGitRepo` (section 5).
- [x] `max_parallel_workers` forced to 1 for non-git tasks — found and
      fixed two gaps beyond the section-6 UI-disabled-field/PATCH-clamp:
      (1) `createTask` was hardcoding `3` regardless of `isGitRepo`, so a
      run started before ever visiting the config page could spawn 3
      concurrent workers on a non-git task; (2) the clamp lived only in the
      PATCH route, so the `GET`-triggered `isGitRepo` re-check (which calls
      `updateTask({isGitRepo})` alone) bypassed it entirely. Fixed both by
      moving the clamp into `updateTask` itself (one guard in the shared
      function, not one per caller) and defaulting `createTask`'s initial
      value from `isGitRepo`. Regression-tested in `task-board.test.ts`.
- [x] Reviewer/merge logic skipped for non-git tasks: `run_reviewer` now
      throws if called on a non-git task (no worktree isolation to review),
      and the orchestrator's own first prompt branches on `task.isGitRepo`
      — the non-git prompt never mentions `run_reviewer`/merge tools at
      all and explicitly instructs one-worker-at-a-time sequencing; the git
      prompt spells out the full review→approve→merge→complete_merge loop
      that was previously left implicit (just tool names with no
      procedure). Re-verified `pi-tool.ts` still loads cleanly under real
      Pi after these changes.

## 9. Manual End-to-End Test Plan
Left for a human with real Pi model credentials — no API key was available
while building this (deliberately not set up; every automated check in
sections 0–8 stops cleanly at "No API key found", past everything that
doesn't need one). See [AGENT.md](../../AGENT.md) "Running it for real" for
the setup steps. Everything below needs actual LLM calls, so it can't be
verified without spending real API credits:
- [ ] Git task, 2 roles (1 worker + 1 reviewer), happy path through merge.
- [ ] Git task, worker fails (`success:false`) — confirm no retry, UI shows message.
- [ ] Trigger a real Pi confirmation prompt in a worker pane — confirm
      `blocked` shows up in the UI with a working attach command.
- [ ] Non-git task, 2 sequential roles.
- [ ] Restart the Next.js server mid-run — confirm the run is marked
      `interrupted`, not stuck `running` forever.

What *is* verified without spending API credits (sections 0–8, all with
a real local `herdr server` and real `pi` binary, zero mocking): task/role
CRUD through the actual HTTP API; a real `POST /api/tasks/:id/runs`
creating a live Herdr workspace/tab/pane and launching `pi -e
pi-tool.ts`, confirmed via `herdr agent read` to have loaded both the
global `herdr-agent-state.ts` integration and `pi-tool.ts` together,
correctly reporting `idle`; `pi-tool.ts` loading and registering all 7
tools under the real Pi extension runtime; the bootstrap-failure/stuck-run
bug and the non-git `max_parallel_workers` bug (both found via this
smoke testing, both fixed and regression-tested).
