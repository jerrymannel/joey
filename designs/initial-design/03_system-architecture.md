# System Architecture

## Table of Contents
- [Process Topology](#process-topology)
- [Control Flow](#control-flow)
- [Shared State, No Internal HTTP](#shared-state-no-internal-http)
- [Decision Log](#decision-log)

## Process Topology

```
Browser (polling)
   |  HTTP
   v
Next.js app (App Router, Node runtime)
   |  better-sqlite3            |  Herdr socket/CLI (start run only)
   v                            v
data.db  logs.db          herdr server (daemon)
   ^  ^                         |
   |  |  direct SQLite access   | manages
   |  +-----------------------+ v
   |                    Herdr workspace (one per run)
   |                    +-- tab: orchestrator (pi -e pi-tool.ts, cwd=main checkout)
   |                    +-- tab: worker A (pi, cwd=worktree A)
   |                    +-- tab: worker B (pi, cwd=worktree B)
   |                    +-- tab: reviewer (pi, cwd=worktree of reviewed worker)
   |                              |
   +------------------------------+
     pi-tool.ts (inside orchestrator's Pi process) reads/writes
     data.db/logs.db directly, and calls Herdr directly to spawn/monitor
```

## Control Flow

1. User configures a **task** in the UI: folder path, orchestrator goal
   (freeform text), sub-agent role roster, secrets file path, max-parallel
   workers. Detects git-vs-non-git at save time (`git rev-parse
   --is-inside-work-tree`).
2. User clicks **Start Run**. The Next.js backend:
   - creates a `runs` row in `logs.db`
   - creates a Herdr workspace `--cwd` = task folder
   - creates the orchestrator's tab `--cwd` = task folder,
     `--env TASK_ID=... RUN_ID=... DATA_DB_PATH=... LOGS_DB_PATH=...`
   - runs `pi -e <path-to-pi-tool.ts>` in that pane, then
     `herdr agent prompt <pane> <assembled goal + role roster>`
3. The **orchestrator** (via `pi-tool.ts`) decides how many workers to spawn
   (bounded by `max_parallel_workers`), and for each: creates a git
   worktree (git tasks only), creates a Herdr tab `--cwd` = worktree,
   `--env` from the task's secrets file, prompts the worker with its role
   instructions + designated artifact path.
4. Orchestrator polls Herdr (`agent.wait`/`pane.read`) for each worker's
   idle-after-working transition, then checks for
   `<worktree>/.orchestrator/done.json`. See
   [08_worker-lifecycle.md](08_worker-lifecycle.md).
5. On worker success, orchestrator spawns a **reviewer** role in the same
   worktree. See [09_review-and-merge.md](09_review-and-merge.md).
6. UI polls `logs.db` (via API routes) and shows worker/reviewer status,
   artifacts, and a Merge button once reviewed. Human clicks Merge → a
   `merge_approved` flag is set.
7. Orchestrator's own bash tool notices the flag, runs `git merge`, updates
   `logs.db`, removes the worktree/branch.
8. If a worker's pane is `blocked`, the UI shows a banner with recent pane
   output and the literal `herdr agent attach <pane_id>` command for the
   user to run themselves.

## Shared State, No Internal HTTP

Both the Next.js server process and every orchestrator process (one per
active run) import the same `src/engine/*` modules and open the same two
SQLite files directly (WAL mode). This was chosen over routing the
orchestrator's writes through the Next.js HTTP API because both live on the
same machine/filesystem — an HTTP hop would add nothing but latency and a
second thing to keep in sync. See [GAP.md](GAP.md) for the accepted
trade-off (multi-process SQLite writers) and
[13_concurrency-and-failure-handling.md](13_concurrency-and-failure-handling.md)
for how contention is kept low (short transactions, small write volume).

## Decision Log

| Decision | Chosen | Rejected alternatives |
|---|---|---|
| UI/backend stack | Next.js (single app) | Separate Fastify+Vite; Electron; TUI |
| Live updates | Polling | SSE; custom WS server |
| Orchestrator nature | Live Pi agent, decides at runtime | Deterministic engine only |
| Orchestrator↔engine link | Direct shared SQLite, no internal HTTP | HTTP-only; file-tailing sync |
| Merge executor | Orchestrator's own bash tool | Next.js backend; race-to-merge |
| Worker done-signal | `done.json` marker + artifact check | Idle-transition only; shell exit code via pane read |
| Reviewer scope | Same worktree, artifact + diff | Separate fresh worktree; diff-only |
| Blocked resolution | Human-attach only (banner + command) | In-browser keystroke injection |
| Worktree cleanup | Remove on merge; keep on failure | Always remove; always manual |
| Secrets storage | Per-task `.env`-style file, path only in `data.db` | Plaintext values in DB; global profile file |
| Concurrency | Configurable max-parallel per task (default 3) | Unbounded |
| Run resumability | One-shot; crash = failed | Reattach to live panes on restart |
| Artifact validation | Minimal hand-rolled validator | Zod; ajv/JSON Schema |
| Merge target branch | Whatever's checked out at run start | Explicit configurable field |
