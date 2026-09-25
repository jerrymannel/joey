# Redesign: tasks as scripts + agents

Status: agreed design, not yet implemented. Replaces the Task/Automation model described in AGENTS.md.

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
| Scripts | `scripts/<name>/app.ts` + `scripts.yaml` | `automation/` renamed. `scripts.yaml` is the single registry: command, description, params. |
| Prompts | `prompts/<name>.md` | Agent prompts, read at run time. Joey's own internal wording moves to `src/engine/templates/`. |
| MCP servers | `mcp.json` | Standard `{ "mcpServers": { name: {command, args, env} \| {url} } }`. |

### Task yaml

```yaml
# tasks/daily-inbox-digest.yaml
name: Daily inbox digest
schedule: "0 8 * * *"
agents:
  summariser:
    prompt: summariser.md       # prompts/summariser.md
    model: claude-bridge/claude-sonnet-5
    thinking: medium
    tools: [gmail_read_email]   # Joey pi-tools (tools.ts catalog)
    mcp: [notion]               # names from mcp.json
  reviewer:
    prompt: reviewer.md
    model: antigravity/gemini-3-pro
steps:
  - script: gmail-unread        # entry in scripts.yaml
    params: { account: me@x.com, query: "is:unread" }
  - agent: summariser
    instruction: Summarise the emails in $RUN_DIR/emails; flag what matters.
  - agent: reviewer
    instruction: Check nothing important was missed.
    reviews: 2                  # step index (1-based) of an earlier agent step
    maxRounds: 3                # default 3
  - agent: summariser
    instruction: Email me the final digest with send_result.
    timeout: 45m                # any step; default 30m
```

- Agents are defined inline, scoped to the task. The same agent name in two steps is the same live session.
- `model` is pi's `provider/id` directly. Validated against `pi --list-models`. Custom endpoints go in pi's
  own `~/.pi/agent/models.json` by hand (Configurations → Models is removed).
- Script `params` are validated against the script's declared params in `scripts.yaml`.

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

- Each agent in a run is one **interactive pi** in its own herdr tab, alive for the whole run
  (`--session-dir $RUN_DIR/sessions`, Joey's pi-tools extension, pi-mcp-adapter with that agent's servers).
- Joey starts it with `herdr agent start --kind pi`, sends messages with
  `herdr agent prompt --wait --until idle --until done`, and reads the reply from the session JSONL
  (no terminal scraping). See Spike findings.
- First use of an agent in a run: its prompt file is sent as the briefing. Each step message =
  instruction + previous step's output + `RUN_DIR`/`TASK_DIR` paths.
- Tools are picked per agent. Tool gating (`pi-tools/tool-access.ts`) switches from the DB's `toolIds`
  to the agent's yaml list, passed per session.
- Tabs close when the run ends; session files stay in `RUN_DIR/sessions/`.

### Review loop

A step with `reviews: N` gets the `review_verdict(verdict: approve|revise, feedback)` tool.

1. Reviewer runs its instruction against step N's output.
2. `revise` → Joey sends the feedback into step N's agent session; that agent revises.
3. Reviewer checks again (its own session continues).
4. Stops on `approve` or at `maxRounds`; either way the latest output carries on as the step output.

### Result

`send_result` (pi-tool) writes `RUN_DIR/result.md` and emails it to the user's email (General settings)
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
3. Engine: yaml loaders + validation, run orchestrator, script runner, agent session driver, review loop,
   `npm run start-run -- <slug>`, tests.
4. Read-only UI.
5. Delete the old code; rewrite AGENTS.md.

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

- Existing gmail/youtube/transcription automations use `run(task, note)` and must be ported to the env contract.
- Tool gating (`pi-tools/tool-access.ts`) must read the agent's yaml tool list (env var per session)
  instead of the DB's `toolIds`.
