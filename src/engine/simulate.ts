import { join } from "node:path";
import { joeyHome, loadScripts, loadTask, promptPath, type StepDef, type TaskDef } from "./definitions.ts";
import { agentEnv, exportLine, herdrAgentName, piArgs } from "./agent-session.ts";
import { runEnv, scriptCommandLine, stepFile, stepInstruction } from "./task-run.ts";
import { shellQuote } from "./herdr.ts";
import { getWorkspaceFolder } from "./settings.ts";
import { template } from "./templates.ts";
import { readFileSync } from "node:fs";

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
  return step.reviews === undefined ? `Agent: ${step.agent}` : `Agent: ${step.agent} (reviews step ${step.reviews + 1})`;
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

  const agent = task.agents[step.agent];
  const herdrName = herdrAgentName("<run-id>", Object.keys(task.agents).indexOf(step.agent), step.agent);
  const commands: string[] = [];
  const fresh = !opened.has(step.agent);
  if (fresh) {
    opened.add(step.agent);
    const sessionDir = join(runDir, "sessions", step.agent);
    const mcpConfig = agent.mcp.length > 0 ? join(sessionDir, "mcp.json") : null;
    const env2 = agentEnv(env, agent, join(sessionDir, "verdict.json"));
    commands.push(`herdr tab create --cwd ${shellQuote(taskDir)} --label ${shellQuote(`joey:${task.slug}:${step.agent}`)} --no-focus`);
    commands.push(exportLine(env2));
    commands.push(`herdr agent start ${herdrName} --kind pi --pane <pane:${step.agent}> --timeout 60000 -- ${piArgs(agent, sessionDir, mcpConfig).map(shellQuote).join(" ")}`);
  }

  // The prompt file briefs the agent once, on its first use (task-run.ts).
  const briefing = fresh ? `${readFileSync(/* turbopackIgnore: true */ promptPath(agent.prompt), "utf8").trim()}\n\n---\n\n` : "";
  const review = step.reviews === undefined ? "" : template("review", { target: (task.steps[step.reviews] as { agent: string }).agent, step: step.reviews + 1 });
  const message = briefing + template("step", { instruction: stepInstruction(step) + review, runDir, taskDir, earlier: "", input: "" });
  commands.push(heredoc(`herdr agent prompt ${herdrName}`, message).replace("{{ms}}", String(step.timeoutMs)));
  return commands;
}
