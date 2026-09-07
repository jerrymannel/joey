export type AgentState = "idle" | "working" | "blocked" | "done" | "unknown";

export interface WorkspaceCreateResult {
  workspaceId: string;
  rootPaneId: string;
  rootTabId: string;
}

export interface TabCreateResult {
  tabId: string;
  rootPaneId: string;
}

export interface AgentWaitResult {
  state: AgentState;
}

export class HerdrCommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HerdrCommandError";
  }
}
