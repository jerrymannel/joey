import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);

export function branchName(taskId: string, workerId: string): string {
  return `worker-${taskId}-${workerId}`;
}

export function worktreePath(mainCheckoutPath: string, taskId: string, workerId: string): string {
  return resolve(mainCheckoutPath, "..", `wt-${taskId}-${workerId}`);
}

export async function isGitRepo(folderPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: folderPath,
    });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function addWorktree(mainCheckoutPath: string, taskId: string, workerId: string): Promise<{
  path: string;
  branch: string;
}> {
  const path = worktreePath(mainCheckoutPath, taskId, workerId);
  const branch = branchName(taskId, workerId);
  await execFileAsync("git", ["worktree", "add", path, "-b", branch], { cwd: mainCheckoutPath });
  return { path, branch };
}

export async function removeWorktree(mainCheckoutPath: string, worktreePath: string, branch: string): Promise<void> {
  await execFileAsync("git", ["worktree", "remove", worktreePath], { cwd: mainCheckoutPath });
  await execFileAsync("git", ["branch", "-d", branch], { cwd: mainCheckoutPath });
}
