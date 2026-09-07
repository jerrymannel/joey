import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isGitRepo, addWorktree, removeWorktree, branchName, worktreePath } from "./worktree.ts";

const execFileAsync = promisify(execFile);

test("branchName/worktreePath are deterministic", () => {
  assert.equal(branchName("t1", "w1"), "worker-t1-w1");
  assert.equal(worktreePath("/repo/main", "t1", "w1"), "/repo/wt-t1-w1");
});

test("isGitRepo detects git vs non-git folders", async () => {
  const gitDir = mkdtempSync(join(tmpdir(), "herdr-git-"));
  await execFileAsync("git", ["init", "-q"], { cwd: gitDir });
  await execFileAsync("git", ["commit", "--allow-empty", "-q", "-m", "init"], { cwd: gitDir });
  assert.equal(await isGitRepo(gitDir), true);

  const plainDir = mkdtempSync(join(tmpdir(), "herdr-plain-"));
  assert.equal(await isGitRepo(plainDir), false);

  rmSync(gitDir, { recursive: true, force: true });
  rmSync(plainDir, { recursive: true, force: true });
});

test("addWorktree/removeWorktree round-trip", async () => {
  const mainDir = mkdtempSync(join(tmpdir(), "herdr-git-main-"));
  await execFileAsync("git", ["init", "-q"], { cwd: mainDir });
  await execFileAsync("git", ["commit", "--allow-empty", "-q", "-m", "init"], { cwd: mainDir });

  const { path, branch } = await addWorktree(mainDir, "t1", "w1");
  assert.ok(existsSync(path));
  assert.equal(branch, "worker-t1-w1");

  await removeWorktree(mainDir, path, branch);
  assert.equal(existsSync(path), false);

  rmSync(mainDir, { recursive: true, force: true });
});
