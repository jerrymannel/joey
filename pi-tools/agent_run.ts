import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { runSubAgent } from "../src/engine/agent-session.ts";
import { jsonResult } from "./json-result.ts";
import { appendConversation } from "./conversation.ts";

/** The run env task-run.ts exported into this agent's pane — passed on to the sub-agent's pane. */
const RUN_ENV_KEYS = ["DATA_DB_PATH", "SETTINGS_DB_PATH", "LOGS_DB_PATH", "LOG_FILE", "JOEY_HOME", "TASK_ID", "RUN_ID", "RUN_DIR", "TASK_DIR"];

export default defineTool({
  name: "agent_run",
  label: "Run Sub-Agent",
  description:
    "Run a sub-agent to do a self-contained piece of work and return its result. You (the supervisor) wait while it runs. Give it a model, a name, and clear instructions; it gets the same tools, MCP servers and skills as you. Its work is recorded in conversation.md.",
  promptSnippet: "agent_run: run a sub-agent with its own model and instructions and get its result back",
  parameters: Type.Object({
    model: Type.String({ description: "The sub-agent's model (a provider/id, or a local model name from models.yaml)" }),
    instructions: Type.String({ description: "What the sub-agent should do — self-contained; it doesn't see your conversation" }),
    name: Type.Optional(Type.String({ description: "A short name for the sub-agent (for logs); default 'sub'" })),
    thinking: Type.Optional(Type.String({ description: "Thinking level: off, minimal, low, medium, high, xhigh, max" })),
    timeout_minutes: Type.Optional(Type.Number({ description: "How long to allow the sub-agent (default 30)" })),
  }),
  async execute(_toolCallId, params) {
    const runDir = process.env.RUN_DIR;
    const cwd = process.env.TASK_DIR ?? process.cwd();
    if (!runDir) throw new Error("agent_run only works inside a Joey task run");
    const env = Object.fromEntries(RUN_ENV_KEYS.map((k) => [k, process.env[k]]).filter(([, v]) => v)) as Record<string, string>;
    const name = params.name?.trim() || "sub";
    const timeoutMs = Math.max(1, params.timeout_minutes ?? 30) * 60_000;

    const { reply } = await runSubAgent({ model: params.model, thinking: params.thinking, instructions: params.instructions, label: name, cwd, runDir, env, timeoutMs });
    appendConversation(`ran sub-agent ${name}`, `**Instructions:** ${params.instructions.trim()}\n\n**${name} replied:**\n${reply}`);
    return jsonResult({ subAgent: name, reply });
  },
});
