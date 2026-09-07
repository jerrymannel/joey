# Folder Structure

## Table of Contents
- [Repo Layout](#repo-layout)
- [Notes](#notes)

## Repo Layout

```
├── app/                              # Next.js App Router
│   ├── api/
│   │   ├── tasks/
│   │   │   ├── route.ts              # GET (list), POST (create)
│   │   │   └── [taskId]/
│   │   │       ├── route.ts          # GET, PATCH, DELETE
│   │   │       ├── roles/
│   │   │       │   ├── route.ts      # GET, POST
│   │   │       │   └── [roleId]/route.ts   # PATCH, DELETE
│   │   │       └── runs/
│   │   │           ├── route.ts      # GET (history), POST (start)
│   │   │           └── [runId]/route.ts    # GET (status)
│   │   └── workers/
│   │       └── [workerId]/
│   │           ├── route.ts          # GET (detail)
│   │           ├── approve-merge/route.ts  # POST
│   │           └── attach-info/route.ts    # GET
│   ├── tasks/
│   │   ├── page.tsx                  # Task list
│   │   └── [taskId]/
│   │       ├── page.tsx              # Task config (goal, roles, secrets path)
│   │       └── runs/[runId]/page.tsx # Run monitor
│   └── layout.tsx
├── src/
│   ├── herdr/
│   │   ├── client.ts                 # Node wrapper over Herdr's unix-socket JSONL API
│   │   └── types.ts                  # Pane/tab/workspace/agent-state types
│   ├── engine/
│   │   ├── db.ts                     # better-sqlite3 handles for data.db/logs.db + migrations
│   │   ├── worktree.ts               # git worktree add/remove, branch naming
│   │   ├── task-board.ts             # data.db reads/writes (tasks, roles)
│   │   ├── run-log.ts                # logs.db reads/writes (runs, workers, events)
│   │   ├── artifact.ts               # done.json + artifact schema validation
│   │   └── secrets.ts                # parse per-task .env-style file into --env args
│   ├── extension/
│   │   └── pi-tool.ts                # Tools exposed to the orchestrator's Pi instance only
│   └── index.ts                      # CLI entry: `node src/index.ts start-orchestrator`
├── data/
│   ├── data.db
│   └── logs.db
├── package.json
├── tsconfig.json
└── next.config.ts
```

## Notes

- `src/engine/*` and `src/herdr/*` are plain TypeScript with no Next.js
  dependency, so both the Next.js server (via `app/api/*`) and the
  orchestrator's `pi-tool.ts` extension can import them directly.
- `src/index.ts` is the small entry point Herdr actually runs in the
  orchestrator's pane (`pi -e ./src/extension/pi-tool.ts`) — `pi-tool.ts`
  itself only registers tools; it imports `src/engine/*` for the real work.
- `data/` holds both SQLite files; excluded from git via `.gitignore`.
  Task folders live wherever the user points a task at — outside this repo.
