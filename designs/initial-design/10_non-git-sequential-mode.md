# Non-Git Sequential Mode

## Table of Contents
- [Detection](#detection)
- [Differences From Git Mode](#differences-from-git-mode)
- [What Stays the Same](#what-stays-the-same)

## Detection

`tasks.is_git_repo` is set by running `git rev-parse --is-inside-work-tree`
in `folder_path` when the task is created or opened. No user toggle — it's
derived from the folder itself, matching the original requirement ("if it
is a git repo... if the folder is not a git repo...").

## Differences From Git Mode

- **No worktrees.** `spawn_worker` skips `worktree.ts` entirely; every
  worker's Herdr tab is created with `--cwd = tasks.folder_path` directly.
- **Sequential, not parallel.** `max_parallel_workers` is effectively
  forced to `1` for non-git tasks (the UI disables that field and shows
  why) — the original requirement states non-git tasks run agents in
  sequential order, and without worktree isolation, concurrent workers
  editing the same files would corrupt each other's work.
- **No reviewer/merge step.** Review-and-merge is a git-branch concept;
  non-git tasks have no `is_reviewer` role invoked and no
  `approve-merge`/merge-execution flow. A worker's `awaiting_review` status
  is simply treated as `completed` for non-git tasks.

## What Stays the Same

- The orchestrator is still a live Pi instance with `pi-tool.ts`, still
  spawned into its own Herdr workspace/tab.
- `spawn_worker`, `check_worker_status`, `read_artifact` behave
  identically — only the worktree step and the parallelism/merge behavior
  differ.
- Blocked-state detection and human-attach escalation
  (see [13_concurrency-and-failure-handling.md](13_concurrency-and-failure-handling.md))
  work the same way, since they're Herdr-level, not git-level.
- `done.json` + artifact validation protocol is identical.
