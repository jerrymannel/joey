# External Tool Contracts: Herdr + Pi

## Table of Contents
- [Status of This Document](#status-of-this-document)
- [Herdr](#herdr)
- [Pi](#pi)
- [Why Not Pi's RPC Mode](#why-not-pis-rpc-mode)

## Status of This Document

All facts below were pulled from `herdr.dev` and `pi.dev` documentation on
2026-09-07. Neither binary is installed on the dev machine this design was
written on. **Re-verify against the real installed CLIs before wiring up
`src/herdr/client.ts`** — see [GAP.md](GAP.md) item 1.

## Herdr

Background daemon (`herdr server`) managing persistent terminal
workspaces/tabs/panes for coding agents, so work survives lid-close/network
loss. Apache 2.0, latest checked version v0.8.2.

**Socket API**: newline-delimited JSON over a unix socket at
`~/.config/herdr/herdr.sock` (or `~/.config/herdr/sessions/<name>/herdr.sock`
for named sessions). One JSON object per line; requests/responses correlate
on an `id` field. Full schema: `herdr api schema --json`.

```json
{"id":"req_1","method":"pane.report_agent","params":{"pane_id":"w1:p1","source":"custom:docs","agent":"docs-bot","state":"working","message":"building docs"}}
```

Agent states: `idle`, `working`, `blocked`, `done`, `unknown`. Pushed via
`pane.report_agent` (affects waits/notifications) or observed via
`pane.report_metadata` (display-only). Subscribe with
`events.subscribe` → `pane.agent_status_changed`, or one-shot with
`herdr agent wait <target> --until <state>`.

**CLI surface** (mirrors the socket API):

| Command | Purpose |
|---|---|
| `herdr workspace create [--cwd PATH] [--label TEXT] [--env KEY=VALUE]` | New workspace (one per task run) |
| `herdr tab create [--workspace ID] [--cwd PATH] [--label TEXT]` | New tab within a workspace (one per agent) |
| `herdr pane run <pane_id> <command>` | Execute a command in a pane (used to launch `pi`) |
| `herdr pane send-text <pane_id> <text>` / `send-keys <pane_id> <key>` | Inject input into a running pane |
| `herdr pane read <pane_id> [--source visible\|recent] [--lines N]` | Capture terminal output (used for blocked-banner context) |
| `herdr pane close <pane_id>` | Kill a pane |
| `herdr agent start <name> --kind KIND --pane ID` | Register a pane as a known agent kind |
| `herdr agent prompt <target> <text> [--wait]` | Send a prompt to an agent, optionally block until response |
| `herdr agent wait <target> [--until STATUS]` | Block until an agent reaches a state |
| `herdr agent attach <agent_name>` | Attach the **caller's own terminal** to a running agent pane (interactive; cannot be triggered from a browser) |
| `herdr integration install pi` | Installs the bundled Pi state-reporting extension globally |

**Pi integration specifics**: `herdr integration install pi` writes
`~/.pi/agent/extensions/herdr-agent-state.ts` (global, user-level). This
extension hooks Pi's internal lifecycle and calls `pane.report_agent` to map
Pi's TUI events to `idle`/`working`/`blocked`. This is a "lifecycle
authority" integration — event-driven, not screen-scraping — but it does
**not** relay Pi's RPC events through Herdr's socket API; callers only see
the three semantic states.

Sources: `herdr.dev`, `herdr.dev/docs/`, `herdr.dev/docs/cli-reference/`,
`herdr.dev/docs/socket-api/`, `herdr.dev/docs/session-state/`,
`herdr.dev/docs/agents/`, `herdr.dev/docs/integrations/`.

## Pi

"Minimal terminal coding harness" by Earendil Inc, MIT licensed
(`@earendil-works/pi-coding-agent`, repo `earendil-works/pi`). Runs
interactively in a terminal by default — this is the mode workers and the
orchestrator both run in (see [Why Not Pi's RPC Mode](#why-not-pis-rpc-mode)).

**Tool/config restriction** (this is what "flat 1-level hierarchy" is built
on — there is no AGENTS.md mechanism in Pi):

| Mechanism | Effect |
|---|---|
| `~/.pi/agent/settings.json` (global) / `.pi/settings.json` (project-local) | `defaultTools` array, `extensions` array |
| `--tools` / `--no-tools` / `--no-builtin-tools` / `--exclude-tools` | CLI-level tool allowlist/denylist for one invocation |
| `-e ./path.ts` | Load one extra extension for one invocation only |
| `pi.registerTool()` (inside an extension) | Extension API for defining a custom tool, incl. `execute()`, `renderCall()`/`renderResult()` |

Extensions auto-load from `~/.pi/agent/extensions/*.ts` and
`.pi/extensions/*.ts` (project-local, after trust). Because worktrees share
the repo's tracked files, **`pi-tool.ts` must never be a tracked
`.pi/extensions/*.ts` or referenced by a tracked `.pi/settings.json`** — a
worker's worktree would inherit it. It is loaded only via `-e` on the one
`pane run` command that starts the orchestrator (see
[07_orchestrator-lifecycle.md](07_orchestrator-lifecycle.md)).

**Env vars relevant here**: `PI_CODING_AGENT_DIR`, `PI_OFFLINE`,
`PI_SESSION_DIR` are Pi's own process config, distinct from the task's
custom `--env` vars (e.g. `ANTHROPIC_API_KEY`) which are just inherited from
the pane's environment.

Sources: `pi.dev`, `pi.dev/docs/latest/`, `pi.dev/docs/latest/settings`,
`pi.dev/docs/latest/extensions`, `pi.dev/docs/latest/security`,
`pi.dev/docs/latest/containerization`, `pi.dev/docs/latest/rpc`.

## Why Not Pi's RPC Mode

Pi supports a headless `--mode rpc` (JSONL over stdin/stdout, with
`agent_start`/`tool_execution_*`/`agent_settled` events and
`extension_ui_request` for confirmations) — this would be a cleaner
programmatic surface than screen state. **Herdr does not broker it**: its
Pi integration is TUI-based only (see above). Speaking RPC directly would
mean the orchestrator manages Pi's stdio pipes itself, bypassing Herdr
entirely — losing Herdr's persistence/reconnect value and the "blocked"
concept this design's human-attach flow depends on. Decision: use Pi
interactively inside Herdr panes for both orchestrator and workers.
