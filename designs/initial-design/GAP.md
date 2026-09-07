# Gaps and Decisions

## Table of Contents
- [How to Read This](#how-to-read-this)
- [Open](#open)
- [Resolved](#resolved)

## How to Read This

This design was produced through an interview covering every fork in the
original [NOTES.md](../../NOTES.md) requirements. Everything under
[Resolved](#resolved) was an explicit decision point where more than one
reasonable design existed; the chosen option and rationale are recorded
here, with the full detail living in the relevant numbered doc. Only one
item remains genuinely [Open](#open).

## Open

### 1. Herdr/Pi API surface is doc-derived, not verified against real binaries
Neither tool is installed on the machine this design was written on. All
CLI/socket details in
[02_external-tool-contracts.md](02_external-tool-contracts.md) come from
`herdr.dev`/`pi.dev` docs fetched 2026-09-07 (Herdr v0.8.2). **Decision**:
proceed on these documented assumptions; re-verify with `herdr api schema
--json` and `pi --help` during [TODO.md](TODO.md) section 0, before writing
`src/herdr/client.ts` for real. If the real CLI differs, only
[02_external-tool-contracts.md](02_external-tool-contracts.md) and the
client implementation should need to change — the rest of the design
(schemas, routes, UI) is written against Herdr's semantic states
(`idle`/`working`/`blocked`/`done`) and Pi's settings/extensions model,
not against exact flag syntax.

## Resolved

| # | Question | Decision | Detail |
|---|---|---|---|
| 1 | What are Herdr/Pi? | Real external tools at herdr.dev / pi.dev | [02](02_external-tool-contracts.md) |
| 2 | Integrate for real or mock? | Real integration only | [02](02_external-tool-contracts.md) |
| 3 | Blocked-worker resolution | Human-attach only, no keystroke injection | [13](13_concurrency-and-failure-handling.md) |
| 4 | Merge gate | Reviewer sub-agent + human confirm | [09](09_review-and-merge.md) |
| 5 | Herdr topology | One workspace/run, one tab/agent | [03](03_system-architecture.md) |
| 6 | Secrets storage | Path-only in `data.db`; values in a per-task `.env` file | [13](13_concurrency-and-failure-handling.md) |
| 7 | UI/backend stack | Single Next.js app | [01](01_overview.md) |
| 8 | Live updates | Polling (3s on the run-monitor page only) | [11](11_api-routes.md) |
| 9 | Task cardinality | Many tasks tracked; one active run per task | [05](05_data-db-schema.md) |
| 10 | Non-git mode | Same orchestrator/Herdr flow, sequential, no worktrees | [10](10_non-git-sequential-mode.md) |
| 11 | Sub-agent config fields | Name/prompt/model, tool allowlist, env file, artifact path+schema | [05](05_data-db-schema.md) |
| 12 | Orchestrator nature | Live Pi agent with a custom tool extension, decides at runtime | [07](07_orchestrator-lifecycle.md) |
| 13 | Orchestrator↔engine link | Shared `src/engine/*` lib + direct SQLite, no internal HTTP | [03](03_system-architecture.md) |
| 14 | Marker/done-signal content | `.orchestrator/done.json` with `{success, message}` | [08](08_worker-lifecycle.md) |
| 15 | Reviewer scope | Runs in the same worktree, reviews artifact + diff | [09](09_review-and-merge.md) |
| 16 | Merge executor | Orchestrator's own bash tool | [07](07_orchestrator-lifecycle.md) |
| 17 | Orchestrator bootstrap data | Herdr `--env` vars (IDs + DB paths) | [07](07_orchestrator-lifecycle.md) |
| 18 | Orchestrator's own cwd | Main checkout, no worktree | [03](03_system-architecture.md) |
| 19 | Worker failure/reviewer-fail handling | Surface to human, no auto-retry | [13](13_concurrency-and-failure-handling.md) |
| 20 | Concurrency cap | Configurable `max_parallel_workers`, default 3, enforced in `spawn_worker` | [13](13_concurrency-and-failure-handling.md) |
| 21 | Run resumability | One-shot; interrupted-on-restart, no reattach | [13](13_concurrency-and-failure-handling.md) |
| 22 | Worktree/branch cleanup | Removed on merge; kept on failure for debugging | [09](09_review-and-merge.md) |
| 23 | DB access layer | `better-sqlite3`, raw SQL, no ORM | [04](04_folder-structure.md) |
| 24 | Artifact schema validation | Minimal hand-rolled validator, no new dependency | [08](08_worker-lifecycle.md) |
| 25 | Merge target branch | Whatever's checked out in the main folder at run start | [07](07_orchestrator-lifecycle.md) |
| 26 | Secrets file granularity | One `.env`-style file per task (covers orchestrator + all roles) | [13](13_concurrency-and-failure-handling.md) |
| 27 | Orchestrator prompt authoring | Single freeform textarea, no structured template | [07](07_orchestrator-lifecycle.md), [12](12_ui-pages.md) |
