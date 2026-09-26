import { join } from "node:path";
import { agentLabel, joeyHome, listSkills, loadMcpServers, loadScripts, loadTask, type StepDef, type TaskDef } from "./definitions.ts";
import { agentEnv, exportLine, herdrAgentName, piArgs } from "./agent-session.ts";
import { runEnv, scriptCommandLine, stepFile, stepInstruction } from "./task-run.ts";
import { shellQuote } from "./herdr.ts";
import { getWorkspaceFolder } from "./settings.ts";
import { template } from "./templates.ts";

/** One task step, with the herdr + pi commands Joey would run for it (labels aside, the very commands from task-run.ts / agent-session.ts). */
export interface SimulatedStep {
  label: string;
  commands: string[];
}

export interface Simulation {
  runDir: string;
  steps: SimulatedStep[];
  /** Notes about placeholders and the parts (ids, prior outputs) only known at run time. */
  notes: string[];
}

function heredoc(name: string, body: string): string {
  return `${name} --wait --timeout {{ms}} <<'PROMPT'\n${body}\nPROMPT`;
}

/**
 * The commands that would run for `tasks/<slug>.yaml`, without running anything — for the Simulate button. Throws with the file's
 * errors if it doesn't validate. Tab/pane/run ids are assigned by herdr at run time, so they appear here as placeholders.
 */
export function simulateTask(slug: string): Simulation {
  const { task, errors } = loadTask(slug);
  if (!task) throw new Error(`tasks/${slug}.yaml has errors:\n${errors.map((e) => `- ${e}`).join("\n")}`);
  const workspace = getWorkspaceFolder() ?? "<workspace>";
  const runDir = join(workspace, slug, "<run-time>");
  const taskDir = join(workspace, slug);
  const run = { id: "<run-id>", runDir } as unknown as Parameters<typeof runEnv>[1];
  const env = runEnv(task, run, taskDir);

  const opened = new Set<string>();
  const steps: SimulatedStep[] = task.steps.map((step, i) => ({ label: labelOf(step, task), commands: commandsFor(i, step, task, env, taskDir, runDir, opened) }));

  if (opened.size > 0) steps.push({ label: "Teardown", commands: [...opened].map((a) => `herdr tab close <tab:${a}>`) });
  return {
    runDir,
    steps,
    notes: [
      "Tab, pane and run ids are assigned by herdr at run time — shown here as placeholders.",
      "Each herdr agent prompt sends the message shown; earlier steps' outputs are filled in at run time where noted.",
      "A step with reviews loops (reviewer → feedback into the reviewed agent → revision back to the reviewer) until approved or maxRounds.",
    ],
  };
}

function labelOf(step: StepDef, task: TaskDef): string {
  if (step.kind === "script") return `Script: ${step.script}`;
  const name = agentLabel(step);
  return step.reviews === undefined ? `Agent: ${name}` : `Agent: ${name} (reviews step ${step.reviews + 1})`;
}

function commandsFor(i: number, step: StepDef, task: TaskDef, env: Record<string, string>, taskDir: string, runDir: string, opened: Set<string>): string[] {
  if (step.kind === "script") {
    const script = loadScripts().scripts[step.script];
    const command = join(joeyHome(), script.command);
    const logFile = stepFile(runDir, i, step, ".log");
    const stepEnv: Record<string, string> = { ...env, STEP_OUTPUT: stepFile(runDir, i, step), JOEY_PARAMS: JSON.stringify(step.params) };
    if (i > 0) stepEnv.STEP_INPUT = "<previous step output>";
    return [`herdr tab create --cwd ${shellQuote(taskDir)} --label ${shellQuote(`joey:${task.slug}:${step.script}`)} --no-focus`, scriptCommandLine(command, stepEnv, logFile), `herdr tab close <tab:${step.script}>`];
  }

  // Each agent step is its own pi session (no named, shared agents), so every one gets its own tab, opened here.
  const name = agentLabel(step);
  const id = `${String(i + 1).padStart(2, "0")}-${name}`;
  opened.add(id);
  const herdrName = herdrAgentName("<run-id>", i, name);
  const sessionDir = join(runDir, "sessions", id);
  const servers = loadMcpServers().servers;
  const mcpConfig = Object.keys(servers).length > 0 ? join(sessionDir, "mcp.json") : null;
  const env2 = agentEnv(env, name, join(sessionDir, "verdict.json"), join(sessionDir, "question.json"));
  const commands: string[] = [
    `herdr tab create --cwd ${shellQuote(taskDir)} --label ${shellQuote(`joey:${task.slug}:${name}`)} --no-focus`,
    exportLine(env2),
    `herdr agent start ${herdrName} --kind pi --pane <pane:${id}> --timeout 60000 -- ${piArgs(step.agent, sessionDir, mcpConfig, listSkills()).map(shellQuote).join(" ")}`,
  ];

  const review = step.reviews === undefined ? "" : template("review", { target: agentLabel(task.steps[step.reviews] as Extract<StepDef, { kind: "agent" }>), step: step.reviews + 1 });
  const message = template("step", { instruction: stepInstruction(step) + review, runDir, taskDir, earlier: "", input: "" });
  commands.push(heredoc(`herdr agent prompt ${herdrName}`, message).replace("{{ms}}", String(step.timeoutMs)));
  return commands;
}
