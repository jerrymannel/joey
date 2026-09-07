# src/extension — read before editing pi-tool.ts

`pi-tool.ts` is the **only** place in this codebase that can call Herdr's
spawn-related methods (`spawn_worker`, `run_reviewer` → `src/herdr/client.ts`).
That's what makes the flat 1-level worker hierarchy a structural guarantee
instead of a prompt-based convention — see
[07_orchestrator-lifecycle.md](../../designs/initial-design/07_orchestrator-lifecycle.md)
and [02_external-tool-contracts.md](../../designs/initial-design/02_external-tool-contracts.md).

## The one rule that must never be violated

**This file must never be tracked as `.pi/extensions/*.ts` or referenced
by a tracked `.pi/settings.json`.** It is loaded exactly once, via a
literal `-e <absolute-path>` flag, from `src/index.ts`'s `startRun()` —
and only for the orchestrator's own pane. Workers get plain `pi` with no
`-e` flag at all (see `spawnAgentInTab` in this file — it never passes an
extension path).

Why this matters: git-task workers run in worktrees, and worktrees share
the repo's *tracked* files with the main checkout. If this file were ever
committed under a tracked `.pi/extensions/` path or wired into a tracked
`.pi/settings.json`, every worker's worktree would auto-load it too, and a
worker would gain the same Herdr-spawning tools as the orchestrator —
breaking the "workers can't spawn their own children" guarantee the whole
design is built on. There's no runtime check for this; it's enforced
purely by never doing it. If you ever add a `.pi/` directory to this repo,
grep it for `pi-tool` before committing anything.

## Runtime facts, verified against the real `pi` package (not guessed)

- Extensions load via `jiti` — raw `.ts` runs directly, no build step, no
  `tsc` emit for this file ever happens.
- `pi.registerTool()` takes a plain object; no `defineTool()` wrapper
  needed. Parameters use `typebox`'s `Type`.
- **String enums must use `StringEnum` from `@earendil-works/pi-ai`**, not
  `Type.Union`/`Type.Literal` — the latter breaks on Google's API per the
  package's own docs. `finish_run`'s `status` param is the one place this
  matters here.
- Verify any change to this file's tool registrations by actually loading
  it under real `pi` (no LLM call needed — the check fails fast before
  any model call is attempted):

  ```bash
  export TASK_ID=<a real task id> RUN_ID=test DATA_DB_PATH=/tmp/t-data.db LOGS_DB_PATH=/tmp/t-logs.db
  pi -e ./src/extension/pi-tool.ts --no-tools -p "test"
  # Success looks like "No API key found for the selected model." —
  # that means every tool registered and the extension loaded cleanly.
  ```
