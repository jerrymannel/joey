# Herdr Control Panel — Build Guide

TypeScript/Next.js control panel that configures and runs an orchestrator
Pi agent (via Herdr) which spawns and supervises worker Pi agents. Full
design spec: [designs/initial-design/01_overview.md](designs/initial-design/01_overview.md).
Phase-by-phase build status (authoritative, keep it current): [designs/initial-design/TODO.md](designs/initial-design/TODO.md).

## Commands

```bash
npm install
npm run dev         # next dev, http://localhost:3000
npm run build       # next build — must stay clean (no errors; warnings ok)
npm run typecheck   # tsc --noEmit
npm test            # node's built-in test runner via tsx, src/**/*.test.ts
npm run start-orchestrator -- <taskId>   # CLI equivalent of "Start Run"
```

Run `typecheck` + `build` + `test` after any change — all three are green
as of the last commit to this file.

## Layout

- `app/` — Next.js App Router. `app/api/**/route.ts` are the HTTP API
  (spec: [11_api-routes.md](designs/initial-design/11_api-routes.md)).
  `app/tasks/**/page.tsx` are the UI pages
  (spec: [12_ui-pages.md](designs/initial-design/12_ui-pages.md)).
  `app/components/*.tsx` are shared client components. `app/lib/types.ts`
  duplicates (deliberately — see its own comment) the client-facing shapes
  of `src/engine`'s types so nothing server-only (`better-sqlite3`) risks
  reaching the client bundle.
- `src/engine/*.ts` — plain TS, no Next.js/Pi dependency. `db.ts` (SQLite
  handles + migrations), `task-board.ts`/`run-log.ts` (CRUD on `data.db`/
  `logs.db`), `worktree.ts`, `artifact.ts`, `secrets.ts`. Imported by both
  the Next.js server and `pi-tool.ts` — this is the "no internal HTTP
  hop" design decision, see [03_system-architecture.md](designs/initial-design/03_system-architecture.md).
- `src/herdr/client.ts` — thin wrapper shelling out to the real `herdr`
  CLI, JSON-envelope parsing. Verified against a locally-run `herdr server`
  during implementation — see the section-3 notes in TODO.md for the exact
  contract (response shapes, which `pane read`/`agent read` source
  actually returns content, agent-name constraints).
- `src/extension/pi-tool.ts` — the orchestrator-only Pi tool extension.
  **Read `src/extension/AGENT.md` before touching this file.**
- `src/index.ts` — exports `startRun(taskId)` (the run-bootstrap logic
  shared by the `POST /api/tasks/:id/runs` route and this file's own
  `start-orchestrator` CLI entry) plus the orchestrator's first-prompt
  construction, which branches on `task.isGitRepo` (git tasks get the
  full review→merge tool sequence spelled out; non-git tasks are told to
  spawn one worker at a time and never call `run_reviewer`).

## Running it for real (beyond `next build`/tests)

This needs infrastructure this repo can't set up for you:

1. `herdr` and `pi` installed and on `PATH` (both were present on the dev
   machine this was built on: `herdr` v0.8.2, `pi` v0.85.1).
2. `herdr integration install pi` run once, globally (writes
   `~/.pi/agent/extensions/herdr-agent-state.ts` — already done on this
   machine; this is what makes Herdr's `idle`/`working`/`blocked`
   detection work for every `pi` pane, workers included, with zero extra
   code on our side).
3. A `herdr server` running — `herdr workspace create`/etc. do **not**
   autostart it; either run bare `herdr` once or `herdr server &`.
4. A working Pi model auth (`pi auth` / `/login` inside a `pi` session, or
   an env var like `ANTHROPIC_API_KEY`) — without it, every spawned agent
   (orchestrator included) loads and registers its tools fine but stops
   at "No API key found" before doing any actual work. That's the exact
   point every automated check in this repo stops at deliberately — no
   API key was available while building this, so no LLM calls were made
   and no cost was incurred. **[TODO.md section 9](designs/initial-design/TODO.md)
   (the manual end-to-end test plan — real git repo, real API key,
   triggering a real Pi confirmation prompt, killing the server mid-run)
   still needs a human with those credentials to run it.**

## Gotchas found during implementation (don't rediscover these)

- `data/data.db`/`data/logs.db` are gitignored and created on first use;
  delete them freely to reset local state.
- `better-sqlite3`'s `ON DELETE CASCADE` needs `PRAGMA foreign_keys = ON`
  — already set in `db.ts`, but easy to lose if `db.ts` is rewritten.
- Non-git tasks must have `max_parallel_workers` clamped to 1 — this is
  enforced centrally in `task-board.ts`'s `updateTask` (not per-caller) and
  defaulted correctly in `createTask`. If you add another way to mutate a
  task's `isGitRepo`/`maxParallelWorkers`, route it through `updateTask`,
  don't reimplement the clamp.
- `startRun` marks the `runs` row `failed` if any bootstrap step throws —
  without that, a bootstrap failure leaves the run `pending` forever and
  permanently blocks the task from starting a new one (the "already
  active" guard treats `pending` as active). If you touch `startRun`,
  keep the try/catch.
- Turbopack will refuse to build cleanly (whole-project tracing warning)
  if `db.ts`'s dynamic path resolution loses its `turbopackIgnore`
  comments — it's a local sqlite path, not a project asset.
