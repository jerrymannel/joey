import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getTask, getRole, getReviewerRole, listRoles, type AgentRole } from "../engine/task-board.ts";
import * as runLog from "../engine/run-log.ts";
import type { Worker as WorkerRow } from "../engine/run-log.ts";
import { addWorktree, removeWorktree } from "../engine/worktree.ts";
import { loadSecretsEnv } from "../engine/secrets.ts";
import { readDoneMarker, readArtifact } from "../engine/artifact.ts";
import { tabCreate, agentStart, agentPrompt, agentGet, agentRead, generateAgentName } from "../herdr/client.ts";

const NON_TERMINAL_RAW_STATUSES = new Set(["pending", "spawning", "working", "blocked"]);

function buildHandoffInstructions(role: AgentRole): string {
  return [
    role.systemPrompt,
    "",
    "--- Handoff protocol ---",
    `When you are finished, write your output to "${role.artifactPath}" (relative to your current working directory).`,
    role.artifactSchema
      ? `That file must be JSON matching this shape: ${JSON.stringify(role.artifactSchema)}.`
      : "",
    `As your last action, write ".orchestrator/done.json" with {"success": true|false, "message": "<one-line summary>"} to signal you are done.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildReviewerHandoff(reviewerRole: AgentRole, reviewedRole: AgentRole, mainCheckoutPath: string): string {
  return [
    reviewerRole.systemPrompt,
    "",
    "--- Review protocol ---",
    `You are reviewing another agent's work in this worktree. Its output is at "${reviewedRole.artifactPath}".`,
    `Find the base branch with: git -C "${mainCheckoutPath}" rev-parse --abbrev-ref HEAD`,
    `Then inspect the changes with: git diff <base-branch>...HEAD`,
    "",
    buildHandoffInstructions(reviewerRole),
  ].join("\n");
}

function buildToolArgs(role: AgentRole): string[] {
  const args: string[] = [];
  if (role.toolsAllowlist?.length) args.push("--tools", role.toolsAllowlist.join(","));
  if (role.toolsDenylist?.length) args.push("--exclude-tools", role.toolsDenylist.join(","));
  return args;
}

async function spawnAgentInTab(opts: {
  workspaceId: string;
  cwd: string;
  label: string;
  role: AgentRole;
  namePrefix: string;
  env: Record<string, string>;
}): Promise<string> {
  const { rootPaneId } = await tabCreate({
    workspaceId: opts.workspaceId,
    cwd: opts.cwd,
    label: opts.label,
    env: opts.env,
  });
  await agentStart({
    name: generateAgentName(opts.namePrefix),
    kind: "pi",
    paneId: rootPaneId,
    args: buildToolArgs(opts.role),
  });
  return rootPaneId;
}

export default function (pi: ExtensionAPI) {
  const taskId = process.env.TASK_ID;
  const runId = process.env.RUN_ID;
  if (!taskId || !runId) {
    throw new Error("pi-tool.ts requires TASK_ID and RUN_ID environment variables");
  }

  const task = getTask(taskId);
  if (!task) throw new Error(`task ${taskId} not found in data.db`);

  function requireWorker(workerId: string): WorkerRow {
    const worker = runLog.getWorker(workerId);
    if (!worker) throw new Error(`worker ${workerId} not found`);
    return worker;
  }

  pi.registerTool({
    name: "list_roles",
    label: "List Roles",
    description: "List this task's configured sub-agent roles (excluding the reviewer role).",
    promptSnippet: "List the task's configured sub-agent worker roles",
    parameters: Type.Object({}),
    async execute() {
      const roles = listRoles(taskId).filter((r) => !r.isReviewer);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              roles.map((r) => ({ id: r.id, name: r.name, systemPrompt: r.systemPrompt })),
              null,
              2,
            ),
          },
        ],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "spawn_worker",
    label: "Spawn Worker",
    description:
      "Spawn a sub-agent worker for the given roleId. Refuses if max_parallel_workers is already reached.",
    promptSnippet: "Spawn a sub-agent worker for a role",
    promptGuidelines: [
      "Use spawn_worker to start a sub-agent for a role returned by list_roles.",
      "If spawn_worker reports capacity reached, wait and retry later rather than spawning more than max_parallel_workers workers.",
    ],
    parameters: Type.Object({ roleId: Type.String() }),
    async execute(_toolCallId, params) {
      if (runLog.countActiveWorkers(runId) >= task.maxParallelWorkers) {
        return {
          content: [{ type: "text", text: "capacity reached, try again once a worker finishes" }],
          details: {},
        };
      }
      const role = getRole(params.roleId);
      if (!role) throw new Error(`role ${params.roleId} not found`);
      const run = runLog.getRun(runId);
      if (!run?.herdrWorkspaceId) throw new Error("run has no herdr workspace yet");

      const workerId = randomUUID();
      let worktreePath: string | null = null;
      let branchName: string | null = null;
      let cwd = task.folderPath;
      if (task.isGitRepo) {
        const wt = await addWorktree(task.folderPath, task.id, workerId);
        worktreePath = wt.path;
        branchName = wt.branch;
        cwd = wt.path;
      }

      const worker = runLog.createWorker({
        id: workerId,
        runId,
        roleId: role.id,
        roleName: role.name,
        worktreePath,
        branchName,
      });

      const env = await loadSecretsEnv(task.secretsFilePath);
      const rootPaneId = await spawnAgentInTab({
        workspaceId: run.herdrWorkspaceId,
        cwd,
        label: role.name,
        role,
        namePrefix: "w",
        env,
      });
      runLog.setWorkerPane(worker.id, rootPaneId);
      runLog.updateWorkerStatus(worker.id, "spawning");
      runLog.addStatusEvent(worker.id, "spawning", null);

      await agentPrompt(rootPaneId, buildHandoffInstructions(role));

      return {
        content: [{ type: "text", text: `spawned worker ${worker.id} for role "${role.name}"` }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "check_worker_status",
    label: "Check Worker Status",
    description: "Poll a worker's current status. Call this repeatedly until the worker is no longer working.",
    promptSnippet: "Poll a spawned worker's current status",
    parameters: Type.Object({ workerId: Type.String() }),
    async execute(_toolCallId, params) {
      const worker = requireWorker(params.workerId);
      const cwd = worker.worktreePath ?? task.folderPath;

      if (!worker.herdrPaneId || !NON_TERMINAL_RAW_STATUSES.has(worker.status)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ status: worker.status }) }],
          details: {},
        };
      }

      const raw = await agentGet(worker.herdrPaneId);

      if (raw === "blocked") {
        if (worker.status !== "blocked") {
          const excerpt = await agentRead(worker.herdrPaneId, { lines: 40 });
          runLog.updateWorkerStatus(worker.id, "blocked");
          runLog.addStatusEvent(worker.id, "blocked", excerpt);
        }
        return { content: [{ type: "text", text: JSON.stringify({ status: "blocked" }) }], details: {} };
      }

      if (raw === "idle" || raw === "done") {
        const role = getRole(worker.roleId)!;
        const marker = await readDoneMarker(cwd);
        if (marker?.success) {
          const artifact = await readArtifact(cwd, role.artifactPath, role.artifactSchema);
          const valid = artifact && (!role.artifactSchema || artifact.validation?.ok);
          runLog.setWorkerArtifactResult(worker.id, Boolean(valid), marker.message);
          runLog.updateWorkerStatus(worker.id, valid ? "awaiting_review" : "failed");
          runLog.addStatusEvent(worker.id, valid ? "awaiting_review" : "failed", marker.message);
          // This worker row is itself a reviewer (run_reviewer set reviewedWorkerId) — its completion
          // is what moves the *reviewed* worker from awaiting_review to reviewed for the UI's Merge button.
          if (valid && worker.reviewedWorkerId) {
            runLog.updateWorkerStatus(worker.reviewedWorkerId, "reviewed");
            runLog.addStatusEvent(worker.reviewedWorkerId, "reviewed", null);
          }
        } else if (marker && !marker.success) {
          runLog.setWorkerArtifactResult(worker.id, false, marker.message);
          runLog.updateWorkerStatus(worker.id, "failed");
          runLog.addStatusEvent(worker.id, "failed", marker.message);
        } else {
          runLog.updateWorkerStatus(worker.id, "failed");
          runLog.addStatusEvent(worker.id, "failed", "no .orchestrator/done.json found after going idle");
        }
      } else if (raw === "working" && raw !== worker.status) {
        runLog.updateWorkerStatus(worker.id, raw);
        runLog.addStatusEvent(worker.id, raw, null);
      }
      // raw === "unknown": Herdr can't classify the pane confidently yet; leave status as-is.

      const refreshed = requireWorker(worker.id);
      return {
        content: [{ type: "text", text: JSON.stringify({ status: refreshed.status, message: refreshed.artifactMessage }) }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "read_artifact",
    label: "Read Artifact",
    description: "Read a worker's artifact file content, validated against its role's artifact schema.",
    promptSnippet: "Read a worker's output artifact",
    parameters: Type.Object({ workerId: Type.String() }),
    async execute(_toolCallId, params) {
      const worker = requireWorker(params.workerId);
      const role = getRole(worker.roleId)!;
      const cwd = worker.worktreePath ?? task.folderPath;
      const artifact = await readArtifact(cwd, role.artifactPath, role.artifactSchema);
      if (!artifact) throw new Error(`artifact not found at ${role.artifactPath}`);
      return {
        content: [{ type: "text", text: artifact.content }],
        details: { validation: artifact.validation },
      };
    },
  });

  pi.registerTool({
    name: "run_reviewer",
    label: "Run Reviewer",
    description: "Spawn the task's reviewer role in a worker's own worktree, once that worker is awaiting_review.",
    promptSnippet: "Spawn the reviewer role for a worker awaiting review",
    parameters: Type.Object({ workerId: Type.String() }),
    async execute(_toolCallId, params) {
      if (!task.isGitRepo) {
        throw new Error("run_reviewer is not available for non-git tasks (no worktree isolation to review)");
      }
      const reviewedWorker = requireWorker(params.workerId);
      const reviewerRole = getReviewerRole(taskId);
      if (!reviewerRole) throw new Error("no reviewer role configured for this task");
      const reviewedRole = getRole(reviewedWorker.roleId)!;
      const run = runLog.getRun(runId);
      if (!run?.herdrWorkspaceId) throw new Error("run has no herdr workspace yet");

      const cwd = reviewedWorker.worktreePath ?? task.folderPath;
      const worker = runLog.createWorker({
        id: randomUUID(),
        runId,
        roleId: reviewerRole.id,
        roleName: reviewerRole.name,
        worktreePath: reviewedWorker.worktreePath,
        branchName: reviewedWorker.branchName,
        reviewedWorkerId: reviewedWorker.id,
      });

      const env = await loadSecretsEnv(task.secretsFilePath);
      const rootPaneId = await spawnAgentInTab({
        workspaceId: run.herdrWorkspaceId,
        cwd,
        label: reviewerRole.name,
        role: reviewerRole,
        namePrefix: "rv",
        env,
      });
      runLog.setWorkerPane(worker.id, rootPaneId);
      runLog.updateWorkerStatus(worker.id, "spawning");
      runLog.addStatusEvent(worker.id, "spawning", null);

      await agentPrompt(rootPaneId, buildReviewerHandoff(reviewerRole, reviewedRole, task.folderPath));

      return {
        content: [{ type: "text", text: `spawned reviewer ${worker.id} for worker ${reviewedWorker.id}` }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "check_merge_approved",
    label: "Check Merge Approved",
    description: "Check whether a human has approved merging a reviewed worker's branch.",
    promptSnippet: "Check whether a human approved a worker's merge",
    parameters: Type.Object({ workerId: Type.String() }),
    async execute(_toolCallId, params) {
      const worker = requireWorker(params.workerId);
      return {
        content: [{ type: "text", text: JSON.stringify({ approved: worker.mergeApprovedAt != null }) }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "complete_merge",
    label: "Complete Merge",
    description:
      "Call after `git merge <branch_name>` has succeeded in the main checkout for an approved worker. Records the merge and removes the worktree/branch.",
    promptSnippet: "Record a completed merge and clean up the worktree",
    promptGuidelines: [
      "Only call complete_merge after check_merge_approved returned approved:true and git merge itself succeeded.",
    ],
    parameters: Type.Object({ workerId: Type.String() }),
    async execute(_toolCallId, params) {
      const worker = requireWorker(params.workerId);
      runLog.completeMerge(worker.id);
      runLog.updateWorkerStatus(worker.id, "merged");
      runLog.addStatusEvent(worker.id, "merged", null);
      if (worker.worktreePath && worker.branchName) {
        await removeWorktree(task.folderPath, worker.worktreePath, worker.branchName);
      }
      return {
        content: [{ type: "text", text: `merged and cleaned up worker ${worker.id}` }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "finish_run",
    label: "Finish Run",
    description:
      "Mark this run as finished once every worker has been spawned, monitored to completion, and (for git tasks) merged or explicitly left for the human to resolve.",
    promptSnippet: "Mark the run as completed or failed once all work is done",
    promptGuidelines: [
      "Call finish_run exactly once, as the last thing you do, when there is no more spawn_worker/run_reviewer/merge work left to drive.",
    ],
    parameters: Type.Object({ status: StringEnum(["completed", "failed"] as const) }),
    async execute(_toolCallId, params) {
      runLog.updateRunStatus(runId, params.status);
      return { content: [{ type: "text", text: `run ${runId} marked ${params.status}` }], details: {} };
    },
  });
}
