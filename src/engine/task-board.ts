import { randomUUID } from "node:crypto";
import { getDataDb } from "./db.ts";
import type { ArtifactSchema } from "./artifact.ts";

export interface Task {
  id: string;
  name: string;
  folderPath: string;
  isGitRepo: boolean;
  orchestratorGoal: string;
  secretsFilePath: string | null;
  maxParallelWorkers: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRole {
  id: string;
  taskId: string;
  name: string;
  isReviewer: boolean;
  systemPrompt: string;
  provider: string;
  model: string;
  toolsAllowlist: string[] | null;
  toolsDenylist: string[] | null;
  artifactPath: string;
  artifactSchema: ArtifactSchema | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskRow {
  id: string;
  name: string;
  folder_path: string;
  is_git_repo: number;
  orchestrator_goal: string;
  secrets_file_path: string | null;
  max_parallel_workers: number;
  created_at: string;
  updated_at: string;
}

interface AgentRoleRow {
  id: string;
  task_id: string;
  name: string;
  is_reviewer: number;
  system_prompt: string;
  provider: string;
  model: string;
  tools_allowlist: string | null;
  tools_denylist: string | null;
  artifact_path: string;
  artifact_schema: string | null;
  created_at: string;
  updated_at: string;
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    name: row.name,
    folderPath: row.folder_path,
    isGitRepo: row.is_git_repo === 1,
    orchestratorGoal: row.orchestrator_goal,
    secretsFilePath: row.secrets_file_path,
    maxParallelWorkers: row.max_parallel_workers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function roleFromRow(row: AgentRoleRow): AgentRole {
  return {
    id: row.id,
    taskId: row.task_id,
    name: row.name,
    isReviewer: row.is_reviewer === 1,
    systemPrompt: row.system_prompt,
    provider: row.provider,
    model: row.model,
    toolsAllowlist: row.tools_allowlist ? JSON.parse(row.tools_allowlist) : null,
    toolsDenylist: row.tools_denylist ? JSON.parse(row.tools_denylist) : null,
    artifactPath: row.artifact_path,
    artifactSchema: row.artifact_schema ? JSON.parse(row.artifact_schema) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listTasks(): Task[] {
  const rows = getDataDb().prepare("SELECT * FROM tasks ORDER BY created_at DESC").all() as TaskRow[];
  return rows.map(taskFromRow);
}

export function getTask(id: string): Task | undefined {
  const row = getDataDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  return row ? taskFromRow(row) : undefined;
}

export function getTaskByFolder(folderPath: string): Task | undefined {
  const row = getDataDb().prepare("SELECT * FROM tasks WHERE folder_path = ?").get(folderPath) as
    | TaskRow
    | undefined;
  return row ? taskFromRow(row) : undefined;
}

export function createTask(input: { name: string; folderPath: string; isGitRepo: boolean }): Task {
  const now = new Date().toISOString();
  const id = randomUUID();
  // Non-git tasks run sequentially — default max_parallel_workers to 1 from creation, not just on
  // the first config save, so a run started before ever visiting the config page can't over-spawn.
  const maxParallelWorkers = input.isGitRepo ? 3 : 1;
  getDataDb()
    .prepare(
      `INSERT INTO tasks (id, name, folder_path, is_git_repo, orchestrator_goal, secrets_file_path, max_parallel_workers, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', NULL, ?, ?, ?)`,
    )
    .run(id, input.name, input.folderPath, input.isGitRepo ? 1 : 0, maxParallelWorkers, now, now);
  return getTask(id)!;
}

export function updateTask(
  id: string,
  patch: Partial<{
    name: string;
    orchestratorGoal: string;
    secretsFilePath: string | null;
    maxParallelWorkers: number;
    isGitRepo: boolean;
  }>,
): Task | undefined {
  const existing = getTask(id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  // Non-git tasks run sequentially — enforced here, not at each call site, so every caller
  // (config-save PATCH, the isGitRepo re-check on GET) gets it for free.
  if (!next.isGitRepo) next.maxParallelWorkers = 1;
  getDataDb()
    .prepare(
      `UPDATE tasks SET name = ?, orchestrator_goal = ?, secrets_file_path = ?, max_parallel_workers = ?, is_git_repo = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      next.name,
      next.orchestratorGoal,
      next.secretsFilePath,
      next.maxParallelWorkers,
      next.isGitRepo ? 1 : 0,
      new Date().toISOString(),
      id,
    );
  return getTask(id);
}

export function deleteTask(id: string): void {
  getDataDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

export function listRoles(taskId: string): AgentRole[] {
  const rows = getDataDb()
    .prepare("SELECT * FROM agent_roles WHERE task_id = ? ORDER BY created_at ASC")
    .all(taskId) as AgentRoleRow[];
  return rows.map(roleFromRow);
}

export function getRole(id: string): AgentRole | undefined {
  const row = getDataDb().prepare("SELECT * FROM agent_roles WHERE id = ?").get(id) as
    | AgentRoleRow
    | undefined;
  return row ? roleFromRow(row) : undefined;
}

export function getReviewerRole(taskId: string): AgentRole | undefined {
  const row = getDataDb()
    .prepare("SELECT * FROM agent_roles WHERE task_id = ? AND is_reviewer = 1 LIMIT 1")
    .get(taskId) as AgentRoleRow | undefined;
  return row ? roleFromRow(row) : undefined;
}

export function createRole(input: {
  taskId: string;
  name: string;
  isReviewer: boolean;
  systemPrompt: string;
  provider: string;
  model: string;
  toolsAllowlist: string[] | null;
  toolsDenylist: string[] | null;
  artifactPath: string;
  artifactSchema: ArtifactSchema | null;
}): AgentRole {
  const now = new Date().toISOString();
  const id = randomUUID();
  getDataDb()
    .prepare(
      `INSERT INTO agent_roles (id, task_id, name, is_reviewer, system_prompt, provider, model, tools_allowlist, tools_denylist, artifact_path, artifact_schema, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.taskId,
      input.name,
      input.isReviewer ? 1 : 0,
      input.systemPrompt,
      input.provider,
      input.model,
      input.toolsAllowlist ? JSON.stringify(input.toolsAllowlist) : null,
      input.toolsDenylist ? JSON.stringify(input.toolsDenylist) : null,
      input.artifactPath,
      input.artifactSchema ? JSON.stringify(input.artifactSchema) : null,
      now,
      now,
    );
  return getRole(id)!;
}

export function updateRole(
  id: string,
  patch: Partial<{
    name: string;
    isReviewer: boolean;
    systemPrompt: string;
    provider: string;
    model: string;
    toolsAllowlist: string[] | null;
    toolsDenylist: string[] | null;
    artifactPath: string;
    artifactSchema: ArtifactSchema | null;
  }>,
): AgentRole | undefined {
  const existing = getRole(id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  getDataDb()
    .prepare(
      `UPDATE agent_roles SET name = ?, is_reviewer = ?, system_prompt = ?, provider = ?, model = ?, tools_allowlist = ?, tools_denylist = ?, artifact_path = ?, artifact_schema = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      next.name,
      next.isReviewer ? 1 : 0,
      next.systemPrompt,
      next.provider,
      next.model,
      next.toolsAllowlist ? JSON.stringify(next.toolsAllowlist) : null,
      next.toolsDenylist ? JSON.stringify(next.toolsDenylist) : null,
      next.artifactPath,
      next.artifactSchema ? JSON.stringify(next.artifactSchema) : null,
      new Date().toISOString(),
      id,
    );
  return getRole(id);
}

export function deleteRole(id: string): void {
  getDataDb().prepare("DELETE FROM agent_roles WHERE id = ?").run(id);
}
