import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getTask, listRoles, type Task } from "./engine/task-board.ts";
import * as runLog from "./engine/run-log.ts";
import { getDataDbPath, getLogsDbPath } from "./engine/db.ts";
import { workspaceCreate, tabCreate, agentStart, agentPrompt, generateAgentName } from "./herdr/client.ts";

// process.cwd(), not import.meta.dirname — see the comment in engine/db.ts.
const PI_TOOL_PATH = resolve(process.cwd(), "src", "extension", "pi-tool.ts");

function buildOrchestratorPrompt(task: Task, roles: { name: string; systemPrompt: string }[]): string {
  const roster = roles
    .map((r) => `- ${r.name}: ${r.systemPrompt.split("\n")[0].slice(0, 200)}`)
    .join("\n");

  const workflow = task.isGitRepo
    ? [
        `Use spawn_worker/check_worker_status/read_artifact to get the work done, respecting a max of ${task.maxParallelWorkers} concurrently active workers — spawn_worker refuses and tells you to retry later once at capacity, so wait and retry rather than treating that as an error.`,
        "Once a worker's check_worker_status reports awaiting_review, call run_reviewer on it to spawn the configured reviewer role in the same worktree.",
        "Once the reviewer itself finishes, the reviewed worker's status becomes reviewed and a human can approve its merge from the UI.",
        "For each worker whose check_merge_approved(workerId) returns approved:true, run `git merge <branch_name>` yourself with your bash tool in the main checkout, then call complete_merge(workerId) on success. On a merge conflict, leave it — report it and move on, do not retry automatically.",
      ]
    : [
        "This is a non-git task: work happens directly in the task folder, sequentially. Spawn exactly one worker at a time and wait for check_worker_status to report a terminal status (awaiting_review or failed) before spawning the next — do not spawn workers concurrently.",
        "There is no reviewer or merge step for non-git tasks. Once a worker reports awaiting_review, treat it as done and move on to the next role.",
      ];

  return [
    task.orchestratorGoal,
    "",
    "--- Available sub-agent roles ---",
    roster || "(none configured)",
    "",
    ...workflow,
    "Call finish_run(status) exactly once, as your last action, once there is no more work left to drive.",
  ].join("\n");
}

/** Bootstraps a run's Herdr workspace + orchestrator pane. Shared by the `POST /api/tasks/:id/runs` route and this CLI entry. */
export async function startRun(taskId: string): Promise<{ runId: string }> {
  const task = getTask(taskId);
  if (!task) throw new Error(`task ${taskId} not found`);

  const run = runLog.createRun(taskId);

  try {
    const ws = await workspaceCreate({ cwd: task.folderPath, label: `run-${run.id}` });
    const { rootPaneId } = await tabCreate({
      workspaceId: ws.workspaceId,
      cwd: task.folderPath,
      label: "orchestrator",
      env: {
        TASK_ID: task.id,
        RUN_ID: run.id,
        DATA_DB_PATH: getDataDbPath(),
        LOGS_DB_PATH: getLogsDbPath(),
      },
    });

    await agentStart({
      name: generateAgentName("orch"),
      kind: "pi",
      paneId: rootPaneId,
      args: ["-e", PI_TOOL_PATH],
    });

    const roles = listRoles(taskId).filter((r) => !r.isReviewer);
    const prompt = buildOrchestratorPrompt(task, roles);
    await agentPrompt(rootPaneId, prompt);

    runLog.updateRunStatus(run.id, "running", { herdrWorkspaceId: ws.workspaceId });
  } catch (err) {
    // A failed bootstrap must not leave the run stuck "pending" forever — that would permanently
    // block this task from starting a new run, since a pending/running run blocks new ones.
    runLog.updateRunStatus(run.id, "failed");
    throw err;
  }

  return { runId: run.id };
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule && process.argv[2] === "start-orchestrator") {
  const taskId = process.argv[3];
  if (!taskId) {
    console.error("usage: node src/index.ts start-orchestrator <taskId>");
    process.exit(1);
  }
  const { runId } = await startRun(taskId);
  console.log(runId);
}
