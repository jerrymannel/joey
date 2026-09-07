# Herdr Control Panel — Initial Design

## Table of Contents
- [Purpose](#purpose)
- [Scope](#scope)
- [Requirement Classification](#requirement-classification)
- [Architecture at a Glance](#architecture-at-a-glance)
- [Glossary](#glossary)
- [Document Map](#document-map)

## Purpose

A TypeScript-based local control panel for configuring and running an
**orchestrator agent** that spawns and supervises multiple **sub-agent
workers**, each running the [Pi](https://pi.dev) coding harness inside a
[Herdr](https://herdr.dev)-managed terminal pane. One control panel instance
manages many **tasks** (each task = one folder to work in); each task can
have many **runs** (each run = one orchestration attempt).

This document set is the output of an interview-driven design pass (see
[GAP.md](GAP.md) for the decisions that were explicitly resolved with the
user, and the one item still open).

## Scope

In scope for this initial design:
- Task/folder configuration, orchestrator goal + sub-agent role configuration
- Real integration with Herdr and Pi (no mocking layer)
- Git-repo tasks: per-worker worktrees, reviewer step, human-gated merge
- Non-git tasks: sequential execution, same orchestrator/Herdr flow
- Status monitoring via polling
- Two SQLite databases: `data.db` (config) and `logs.db` (run history)

Out of scope for v1 (see [GAP.md](GAP.md) and
[13_concurrency-and-failure-handling.md](13_concurrency-and-failure-handling.md)):
run resumability after a crash, automated retry, in-browser terminal attach,
live push (WebSocket) updates.

## Requirement Classification

| Impact | Requirement |
|---|---|
| **High** | TS control panel (Next.js); configure orchestrator + sub-agents from UI; Herdr-driven Pi execution; custom env per instance; status monitoring; task-folder scoping; `data.db` + `logs.db`; worktree isolation + merge-after-review gate; sequential non-git mode; blocked-state escalation; flat 1-level hierarchy (no recursive spawning) |
| **Medium** | Reviewer sub-agent step; concurrency cap; worktree/branch cleanup policy; artifact schema validation; multi-task tracking/history |
| **Low** | Secrets file UX polish; run resumability; configurable retry policy; live-push transport |

## Architecture at a Glance

- **One Next.js app** (App Router, Node runtime) is both the UI and the
  backend. It owns `data.db`/`logs.db` via `better-sqlite3` and serves the
  browser over plain HTTP with polling — no custom server, no WebSocket.
- **The orchestrator is itself a live Pi instance**, not a deterministic
  script. The backend spawns it into its own Herdr workspace/tab
  (`--cwd` = the task's main checkout, `--env` carries `TASK_ID`, `RUN_ID`,
  `DATA_DB_PATH`, `LOGS_DB_PATH`). It loads a custom extension
  (`pi-tool.ts`, via a one-off `-e` flag — never committed into a tracked
  `.pi/settings.json` that a worker's worktree could inherit).
- `pi-tool.ts` talks to **Herdr directly** (spawns/monitors worker panes)
  and to `data.db`/`logs.db` **directly** via the same shared
  `src/engine/*` library the Next.js backend uses — no internal HTTP hop
  between the orchestrator process and the web server.
- **Workers** are plain Pi instances (no custom extension), one per Herdr
  tab, `--cwd` = their own `git worktree`, `--env` from a per-task
  `.env`-style secrets file. This structurally enforces the flat hierarchy:
  workers simply have no tool that can reach Herdr.
- Workers signal completion by writing `.orchestrator/done.json`; the
  orchestrator then validates the configured artifact file.
- A **reviewer** role runs in the same worktree afterward; a human clicks
  Merge in the UI, the orchestrator's own bash tool notices the approval
  flag and runs `git merge`, then cleans up the worktree/branch.
- Non-git tasks reuse the same orchestrator/Herdr flow, just sequential and
  without worktrees.

## Glossary

| Term | Meaning |
|---|---|
| Task | A configured folder + orchestrator goal + sub-agent role roster |
| Run | One execution attempt of a task's orchestrator |
| Worker | One sub-agent role instance spawned for a run |
| Herdr workspace/tab/pane | Herdr's grouping units for terminal sessions; one workspace per run, one tab per agent (orchestrator, each worker, each reviewer) |
| Role | A reusable sub-agent configuration (prompt, model, tools, env) a task can spawn as a worker |

## Document Map

| File | Contents |
|---|---|
| [02_external-tool-contracts.md](02_external-tool-contracts.md) | Verified Herdr + Pi CLI/API reference, with sources |
| [03_system-architecture.md](03_system-architecture.md) | Process topology, control/data flow, decision log |
| [04_folder-structure.md](04_folder-structure.md) | Repo layout |
| [05_data-db-schema.md](05_data-db-schema.md) | `data.db` tables |
| [06_logs-db-schema.md](06_logs-db-schema.md) | `logs.db` tables |
| [07_orchestrator-lifecycle.md](07_orchestrator-lifecycle.md) | Orchestrator bootstrap, `pi-tool.ts` contract, merge execution |
| [08_worker-lifecycle.md](08_worker-lifecycle.md) | Worker spawn, `done.json`, artifact contract |
| [09_review-and-merge.md](09_review-and-merge.md) | Reviewer flow, human approval, cleanup |
| [10_non-git-sequential-mode.md](10_non-git-sequential-mode.md) | Non-git task differences |
| [11_api-routes.md](11_api-routes.md) | Next.js API route reference |
| [12_ui-pages.md](12_ui-pages.md) | Pages and key components |
| [13_concurrency-and-failure-handling.md](13_concurrency-and-failure-handling.md) | Concurrency cap, blocked/attach, failure policy, secrets |
| [TODO.md](TODO.md) | Build checklist |
| [GAP.md](GAP.md) | Resolved decisions log + open risk |
