# Review and Merge

## Table of Contents
- [Reviewer Spawn](#reviewer-spawn)
- [Reviewer Verdict](#reviewer-verdict)
- [Human Approval Flow](#human-approval-flow)
- [Merge and Cleanup](#merge-and-cleanup)

## Reviewer Spawn

Once a worker reaches `awaiting_review` (see
[08_worker-lifecycle.md](08_worker-lifecycle.md)), the orchestrator calls
`pi-tool.ts`'s `run_reviewer(workerId)`:

1. Looks up the task's single `agent_roles` row with `is_reviewer = 1`.
2. Spawns it via the **same** spawn sequence as any worker
   (`herdr tab create`), but `--cwd` = the **reviewed worker's own
   worktree path** (not a new worktree) — so `git diff <base>...HEAD` and
   the worker's artifact file are both immediately visible.
3. Inserts a `workers` row for the reviewer with
   `reviewed_worker_id = <workerId>`.
4. The reviewer's prompt (its `system_prompt` + generated instructions)
   tells it to read the artifact, run `git diff` against the branch the
   worktree was created from, and write its own verdict artifact + its own
   `done.json` — it follows the identical done-signal protocol as any
   other worker.

## Reviewer Verdict

The reviewer's `agent_roles.artifact_path`/`artifact_schema` should be
configured (at task-setup time) to something like:

```json
{ "required": ["verdict", "notes"], "fields": { "verdict": "string", "notes": "string" } }
```

with `verdict` expected to be `"pass"` or `"fail"` by convention (enforced
by the reviewer's prompt, not the schema — the hand-rolled validator only
checks shape, not enum values, per the chosen minimal-validator approach).

## Human Approval Flow

1. Once the reviewer worker itself reaches `awaiting_review` (i.e. it
   finished), the **reviewed** worker's status moves to `reviewed`, and its
   verdict artifact is surfaced in the run-monitor UI next to that worker's
   card.
2. Regardless of the reviewer's verdict, a **Merge** button is shown — the
   verdict informs the human, it does not gate the button (a human can
   override a `fail` verdict, e.g. if the reviewer misjudged something).
3. Clicking Merge calls `POST /api/workers/:workerId/approve-merge`, which
   sets `workers.merge_approved_at` and moves status to `awaiting_merge`.
   This is the only field the human-facing API writes for this flow.

## Merge and Cleanup

Performed by the orchestrator's own bash tool once it observes
`merge_approved_at` is set (see
[07_orchestrator-lifecycle.md](07_orchestrator-lifecycle.md) "Merge
Execution"):

- **Success**: `git worktree remove <path>`, `git branch -d
  <branch_name>`, `workers.merged_at` set, `workers.status = 'merged'`.
- **Failure/rejection** (reviewer verdict was `fail` and the human never
  clicks Merge, or `git merge` conflicts): worktree and branch are left in
  place. The run itself can still be marked `completed` if all other
  workers succeeded — an un-merged worker doesn't block the whole run from
  finishing, it just sits as a loose end the human resolves later (no
  auto-retry, per [GAP.md](GAP.md)).
