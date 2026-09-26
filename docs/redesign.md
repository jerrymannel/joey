# Redesign: tasks as scripts + agents

Status: implemented (2026-09-25). Replaced the old Task/Automation/mailbox model; AGENTS.md describes the code as it is.

A task is an ordered list of steps. Each step is either a **script** (deterministic code) or an **agent**
(a pi session guided by a prompt, with tools and MCP servers). Example:

1. script: fetch all unread email
2. agent `summariser`: summarise, highlight what matters
3. agent `reviewer`: review step 2, send feedback to `summariser` until satisfied
4. agent `summariser`: email me the final digest

## Files (hand-edited, in the repo)

| What | Where | Notes |
|---|---|---|
| Tasks | `tasks/<slug>.yaml` | One file per task. Filename = task id = workspace folder name. Renaming the file makes a new task; old runs stay under the old slug. |
| Scripts | `scripts/<name>/app.ts` + `scripts/<name>/config.yaml` | `automation/` renamed. Each script folder has a `config.yaml`: command (default `app.ts`), description, params. |
| Prompts | `prompts/<name>.md` | Agent prompts, read at run time. Joey's own internal wording moves to `src/engine/templates/`. |
| MCP servers | `mcp.json` | Standard `{ "mcpServers": { name: {command, args, env} \| {url} } }`. |

### Task yaml

```yaml
# tasks/daily-inbox-digest.yaml
name: Daily inbox digest
schedule: "0 8 * * *"
steps:
  - script: gmail-unread        # a scripts/gmail-unread/config.yaml
    params: { account: me@x.com, query: "is:unread" }
  - agent: { model: claude-bridge/claude-sonnet-5, thinking: medium }
    instructions: Summarise the emails in $RUN_DIR/emails; flag what matters.
  - agent: { model: antigravity/gemini-3-pro }
    instructionsFile: reviewer-check.md   # or an inline `instructions:` — exactly one
    reviews: 2                  # step index (1-based) of an earlier agent step
    maxRounds: 3                # default 3
  - agent: { model: claude-bridge/claude-sonnet-5 }
    instructions: Email me the final digest with task_send_result.
    timeout: 45m                # any step; default 30m
```

- Each agent step is a `model` (+ optional `thinking`) and its `instructions` — either inline (`instructions`)
  or a file in `prompts/` (`instructionsFile`), exactly one. There is no separate prompt/briefing.
  Every agent gets **all** of Joey's tools, **all** of `mcp.json`'s servers and **all** of `skills/`.
- Each agent step is its own pi session; there are no named agents shared across steps. (A `reviews: N` loop
  still feeds revisions into step N's own session, which stays open for the run.)
- `model` is pi's `provider/id` directly, or a local model named in `models.yaml`.
- Script `params` are validated against the script's declared params in `scripts/<name>/config.yaml`.
- An agent step's message is either an inline `instructions:` or an `instructionsFile:` (a file in `prompts/`, read at run time) — exactly one.

## Database

- `data.db`: `tasks` holds runtime state only — `slug`, `paused`, `last_scheduled_at` — upserted when
  `tasks/` is scanned. Wiped on migration (greenfield).
- `logs.db`: `runs` (+ per-step rows). Wiped on migration.
- `settings.db`: kept — OAuth tokens, SSH configs, general settings. `models`/`prompts` tables dropped.

## Runs

- Run folder: `<workspace>/<slug>/<YYYY-MM-DDTHH-mm-ss>/` (`RUN_DIR`). `<workspace>/<slug>/` is `TASK_DIR`,
  for cross-run state (e.g. "already seen" ids).
- Inside `RUN_DIR`: `steps/NN-<name>.md` (each step's output), `result.md` (final output),
  `sessions/` (pi session JSONL per agent).
- One active run per task (existing guard). Triggered manually or by the cron scheduler; `paused` skips cron.
- First failing step fails the run; later steps skipped. No automatic retries. Per-step timeout.

### Script steps

Run as `tsx scripts/<name>/app.ts` in a herdr tab. Scripts import the engine and read credentials from the
DB themselves (loading `.env.local` for `SETTINGS_ENCRYPTION_KEY`, like `pi-tools/index.ts`).

| Env | Meaning |
|---|---|
| `RUN_DIR` | this run's folder |
| `TASK_DIR` | the task's persistent folder |
| `STEP_INPUT` | path to the previous step's output file (absent for step 1) |
| `STEP_OUTPUT` | path the script must write its output to |
| `JOEY_PARAMS` | JSON of the step's `params` |

stdout/stderr go to the run log only. Exit code 0 = success.

### Agent steps

- Each agent step is one **interactive pi** in its own herdr tab, alive for the rest of the run
  (`--session-dir $RUN_DIR/sessions/<NN-agent>`, Joey's pi-tools extension, pi-mcp-adapter with every server, `--skill` per skill).
- Joey starts it with `herdr agent start --kind pi`, sends messages with
  `herdr agent prompt --wait --timeout <step timeout>` (settles on idle, done or blocked; blocked fails the step), and reads the reply from the session JSONL
  (no terminal scraping). See Spike findings.
- Each step message = the step's `instructions` + `RUN_DIR`/`TASK_DIR` paths + the paths of every earlier step's
  output + the previous step's output (pasted up to 20k chars, else referenced by path). A review step gets the
  reviewed step's output instead. There is no separate briefing.
- Every agent gets every tool, every MCP server and every skill — no per-agent selection.
- Tabs close when the run ends; session files stay in `RUN_DIR/sessions/`.

### Review loop

A step with `reviews: N` gets the `task_review_verdict(verdict: approve|revise, feedback)` tool.

1. Reviewer runs its instruction against step N's output.
2. `revise` → Joey sends the feedback into step N's agent session; that agent revises.
3. Reviewer checks again (its own session continues).
4. Stops on `approve` or at `maxRounds`; either way the latest output carries on as the step output.

### Result

`task_send_result` (pi-tool) writes `RUN_DIR/result.md` and emails it to the user's email (General settings)
from the mailbox account. If no step calls it, the last step's output is `result.md`.

## Removed

- Agent-to-agent mailbox: plus-addresses, inbox poller (`inbox-scheduler.ts`), hops, `X-Joey-*` headers,
  `mailbox_send_message`, `mailbox_list_agents`. Only emailing the result to the user survives.
- Harnesses other than pi (`claude`, `agy`, `adk`, `runCliInHerdr`).
- Configurations → Models, Configurations → Prompts (DB), the results folder setting + Results page.
- Automations pages, `AutomationForm.tsx`, YouTube Downloads section, per-service Task columns
  (`searchQuery`, `playlistId`, `extensions`, `transcribe`, `account`, `service`).
- Tasks CRUD pages (tasks are yaml now).

## UI

Everything read-only except Settings.

- **Tasks** — list of `tasks/*.yaml`; view shows parsed agents/steps and validation errors; Start Run; pause.
- **Runs** — all runs; per-step status and logs, agent transcripts, result.
- **Library** — Scripts, Prompts, Tools, MCP servers.
- **Settings** — General, Integrations, SSH.

## Plan

1. ~~Commit current WIP.~~ Done.
2. ~~**Spike** (throwaway)~~ Done — see Spike findings.
3. ~~Engine~~ Done — see Engine (as built). Verified end to end against real herdr + pi (Haiku): script → agent →
   review loop (both "approved in round 2" and "not approved after 2 rounds") → result.
4. ~~Read-only UI~~ Done. Pages: `/tasks`, `/tasks/[slug]`, `/runs`, `/runs/[id]`, `/library/{scripts,prompts,tools,mcp}`,
   `/settings/{general,ssh}`, `/integrations`. APIs: `/api/tasks` (+ `/[slug]` GET/PATCH paused, `/[slug]/runs`
   GET/POST), `/api/runs` (+ `/[id]` with step outputs and result, capped at 200k chars), `/api/library/*`. The old task,
   automation, results, models and prompts pages and their API routes are gone; their engine modules go in step 5.
5. ~~Delete the old code; rewrite AGENTS.md~~ Done. Also: the tool catalog is code-only (no `tools` table),
   the prompt-text-only YouTube tools are gone, every Gmail/YouTube tool checks the agent's `tools:` list,
   `prompt-files.ts` is `templates.ts` (`TEMPLATES_DIR`), and the results-folder setting is gone. Old tables are
   dropped when each database opens.

## Engine (as built)

| File | What |
|---|---|
| `src/engine/definitions.ts` | Loads + validates `tasks/*.yaml`, `scripts/*/config.yaml`, `mcp.json`, `prompts/` under `JOEY_HOME` (default: repo). |
| `src/engine/task-run.ts` | `startTaskRun(slug)`: run folder, steps in order, script runner, review loop, `result.md`. |
| `src/engine/agent-session.ts` | One interactive pi per agent in a herdr tab: open, `ask`, close; reads replies from the session JSONL. |
| `src/engine/task-runs.ts` | `task_runs` / `run_steps` (logs.db), `task_state.paused` (data.db). |
| `src/engine/templates/step*.md`, `review*.md`, `verdict-reminder.md` | The wording of step and review messages. |
| `pi-tools/task_send_result.ts`, `task_review_verdict.ts` | Always-on tools (service `task`; tool names must start with their service). |
| `scripts/joey.ts` + `scripts/<name>/app.ts` | Script helper (env, params, `output()`, loads `.env.local`) and the three ported automations. |
| `tasks/inbox-digest.yaml` | The example above, unscheduled. |

- `npm run start-run -- <slug>` waits for the run and exits non-zero on failure (an old task id still runs the old way).
- The scheduler ticks yaml tasks alongside old ones; startup marks runs left `running` as `interrupted`.
- Tool names are prefixed: `task_send_result`, `task_review_verdict`. `JOEY_TOOLS` (the agent's yaml tools) gates
  every tool but the `task_*` ones.
- A reviewer that ends its turn without `task_review_verdict` gets one reminder; a second miss fails the step.

## Spike findings (2026-09-25)

Proven against pi 0.85.1 + herdr, with `claude-bridge/claude-haiku-4-5`:

- **Start:** `herdr tab create --cwd <TASK_DIR> --label … --no-focus`, then
  `herdr agent start <name> --kind pi --pane <pane_id> --timeout 60000 -- --session-dir <RUN_DIR>/sessions --model … --extension <repo>/pi-tools/index.ts`.
  Returns in ~3s once pi is ready; the result's `agent.agent_session.value` is the session JSONL path.
  Agent names must be unique across herdr → use `<slug>-<run>-<agent>`.
- **Send + wait:** `herdr agent prompt <name> "<text>" --wait --until idle --until done`. Multi-line text
  arrives intact as one user message. It waits through tool calls and matches only states *after*
  submission (no stale return). **A finished turn reports `done`, not `idle`** — `--until idle` alone
  hangs forever. Always pass a timeout (the step's).
- **Read reply:** the last line in the JSONL with `type: "message"`, `message.role: "assistant"`,
  `message.stopReason: "stop"`; its `content[]` items of `type: "text"` are the reply.
- **Session memory:** a second prompt into the same agent sees the first turn.
- **Close:** `herdr tab close <tab_id>`.
- **MCP:** `pi-mcp-adapter` is already installed and adds `--mcp-config <path>`. Plan: write
  `<RUN_DIR>/sessions/<agent>.mcp.json` holding only that agent's servers from repo `mcp.json`. Global MCP
  files (`~/.config/mcp/mcp.json`, `~/.pi/agent/mcp.json`) would still merge in; none exist here. Not yet
  run against a live MCP server — check in the engine phase.
- The committed `harness.ts` already passes `--mcp-config <cwd>/.mcp.json` when that file exists; the new
  per-agent file replaces it.

## Open items

- MCP (`--mcp-config` per agent) hasn't been run against a live MCP server yet.
- `scripts/gmail-search` and `scripts/youtube-playlist` typecheck but haven't been run for real.

