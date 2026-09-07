# Concurrency, Failure Handling, and Secrets

## Table of Contents
- [Concurrency Cap](#concurrency-cap)
- [Blocked Escalation](#blocked-escalation)
- [Failure Policy](#failure-policy)
- [Run Resumability](#run-resumability)
- [Secrets File Handling](#secrets-file-handling)

## Concurrency Cap

Enforced inside `pi-tool.ts`'s `spawn_worker` tool (see
[07_orchestrator-lifecycle.md](07_orchestrator-lifecycle.md)): before
spawning, it counts `workers` rows for the current `run_id` with
`status IN ('spawning','working','idle')` and compares against
`tasks.max_parallel_workers`. If at the cap, the tool returns a "capacity
reached, try again once a worker finishes" result rather than spawning —
the orchestrator (an LLM) is expected to retry later in its own loop, not
the engine queuing on its behalf. This keeps the cap enforcement in one
place (the tool boundary) rather than needing a separate scheduler.

## Blocked Escalation

1. The orchestrator's monitoring loop (`check_worker_status`, backed by
   `agent.wait`/`events.subscribe` against Herdr) sees a worker's pane
   report `blocked`, writes a `status_events` row with a `pane read`
   excerpt as `detail`, and sets `workers.status = 'blocked'` (previous
   status is retained implicitly via the event history, so the UI can
   resume the right badge once unblocked).
2. The run-monitor page's next poll shows a `BlockedBanner` on that
   worker's card (see [12_ui-pages.md](12_ui-pages.md)).
3. There is **no automated unblocking**. A human runs
   `herdr agent attach <pane_id>` themselves, resolves the prompt in their
   real terminal, and detaches. The orchestrator's next `agent.wait` call
   observes the pane leaving `blocked` and resumes monitoring normally.
4. This applies identically to worker, reviewer, and (in principle)
   orchestrator panes, though the orchestrator itself pausing on a
   confirmation is a narrower risk since `pi-tool.ts`'s tools are the only
   sensitive actions it takes, and those aren't shell commands Pi would
   itself prompt about the way ad hoc bash is.

## Failure Policy

No automated retry anywhere in v1: a worker with `success: false` (or a
missing/invalid artifact) becomes `failed` and stays there; a reviewer
verdict of `fail` doesn't block the Merge button but is visible next to it
for the human to weigh. A human re-running that role means editing the
role's prompt (if needed) and clicking Start Run again — which starts a
**new** run, not a retry of the old one's specific worker. Per-role
configurable retry counts were considered and explicitly deferred (see
[GAP.md](GAP.md)).

## Run Resumability

Runs are one-shot. If the Next.js process restarts while a run is
`running`, that run's Herdr panes keep running (Herdr's whole point is
surviving process loss) but nothing is watching them anymore. On startup,
the backend marks any `runs` row still `running` at boot as `interrupted`
rather than attempting to reattach — reattachment (matching live Herdr
panes back to `workers` rows and resuming monitoring loops) is real
engineering deferred past v1. The now-orphaned Herdr panes remain
inspectable manually via the Herdr CLI until a human cleans them up.

## Secrets File Handling

- `tasks.secrets_file_path` points at a `.env`-style file
  (`KEY=VALUE` per line) that the user creates and edits **outside** the
  app, at a path of their choosing (e.g. `<task-folder>/.herdr.env`, kept
  out of git via the task repo's own `.gitignore`).
- `data.db` never stores secret values, only this path.
- `src/engine/secrets.ts` parses the file at spawn time (both orchestrator
  and worker spawns use the same file) into `--env KEY=VALUE` arguments for
  `herdr tab create`. A missing file at spawn time fails that spawn with a
  clear error surfaced to `status_events`, rather than silently spawning
  with no env vars.
