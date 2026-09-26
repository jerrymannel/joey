import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { joeyHome, loadMcpServers, loadScripts, loadTask, promptPath, type StepDef, type TaskDef } from "./definitions.ts";
import { ask, closeAgentSession, herdrAgentName, openAgentSession, type AgentSession } from "./agent-session.ts";
import * as herdr from "./herdr.ts";
import { appendTaskRunLog, createTaskRun, finishTaskRun, hasActiveRun, skipPendingSteps, updateRunStep, type TaskRun } from "./task-runs.ts";
import { dataDbPath, logsDbPath, settingsDbPath } from "./db.ts";
import { getWorkspaceFolder } from "./settings.ts";
import { template } from "./templates.ts";
import { errMsg, log } from "./logger.ts";

const rlog = log("task-run");

/** A previous step's output longer than this is referenced by path instead of pasted into the agent's message. */
const INLINE_LIMIT = 20_000;

const repo = (...p: string[]) => resolve(/* turbopackIgnore: true */ process.cwd(), ...p);

function stepLabel(step: StepDef, task: TaskDef): string {
  if (step.kind === "script") return `script ${step.script}`;
  return step.reviews === undefined ? `agent ${step.agent}` : `agent ${step.agent} reviews step ${step.reviews + 1} (${(task.steps[step.reviews] as { agent: string }).agent})`;
}

export function stepFile(runDir: string, i: number, step: StepDef, suffix = ".md"): string {
  return join(runDir, "steps", `${String(i + 1).padStart(2, "0")}-${step.kind === "script" ? step.script : step.agent}${suffix}`);
}

/** The shell command a script step types into its herdr pane: `env K=V … [tsx] <command> > <log> 2>&1`. Shared with the simulator so it can't drift. */
export function scriptCommandLine(command: string, env: Record<string, string>, logFile: string): string {
  // `env K=V … cmd` rather than a K=V prefix: works in whatever shell the herdr pane runs.
  const argv = [...(command.endsWith(".ts") ? [repo("node_modules/.bin/tsx")] : []), command];
  const line = ["env", ...Object.entries(env).map(([k, v]) => `${k}=${v}`), ...argv].map(herdr.shellQuote).join(" ");
  return `${line} > ${herdr.shellQuote(logFile)} 2>&1`;
}

/** The instruction text an agent step sends: inline `instruction`, or the contents of its `instructionFile` in prompts/. */
export function stepInstruction(step: Extract<StepDef, { kind: "agent" }>): string {
  return step.instructionFile ? readFileSync(/* turbopackIgnore: true */ promptPath(step.instructionFile), "utf8").trim() : step.instruction.trim();
}

/** Local time, `2026-09-25T14-30-05` — no colons, so it's a safe folder name and sorts by time. */
function runFolderName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
}

/** What every step's process (a script, or pi and its tools) needs to know. Nothing secret: those come from the databases. */
export function runEnv(task: TaskDef, run: TaskRun, taskDir: string): Record<string, string> {
  return {
    DATA_DB_PATH: dataDbPath(),
    SETTINGS_DB_PATH: settingsDbPath(),
    LOGS_DB_PATH: logsDbPath(),
    LOG_FILE: repo(process.env.LOG_FILE ?? "data/joey.log"),
    JOEY_HOME: joeyHome(),
    TASK_ID: task.slug,
    RUN_ID: run.id,
    RUN_DIR: run.runDir,
    TASK_DIR: taskDir,
  };
}

/**
 * Starts a run of `tasks/<slug>.yaml` and returns at once; the steps run in the background. Refuses an invalid file, a task that's
 * already running, and a missing workspace folder. The run folder is `<workspace>/<slug>/<local time>/`.
 */
export function startTaskRun(slug: string): { runId: string } {
  const { task, errors } = loadTask(slug);
  if (!task) throw new Error(`tasks/${slug}.yaml has errors:\n${errors.map((e) => `- ${e}`).join("\n")}`);
  const workspace = getWorkspaceFolder();
  if (!workspace) throw new Error("no workspace folder configured — set one in General settings");
  if (hasActiveRun(slug)) throw new Error(`${slug} is already running`);

  const taskDir = join(workspace, slug);
  let runDir = join(taskDir, runFolderName());
  for (let n = 2; existsSync(runDir); n++) runDir = join(taskDir, `${runFolderName()}-${n}`);
  mkdirSync(join(runDir, "steps"), { recursive: true });
  mkdirSync(join(runDir, "sessions"), { recursive: true });

  const run = createTaskRun(slug, runDir, task.steps.map((s) => stepLabel(s, task)));
  rlog.info({ slug, runId: run.id, runDir }, "run started");
  void executeRun(task, run, taskDir);
  return { runId: run.id };
}

async function executeRun(task: TaskDef, run: TaskRun, taskDir: string): Promise<void> {
  const note = (text: string) => appendTaskRunLog(run.id, `${text}\n`);
  const env = runEnv(task, run, taskDir);
  const sessions = new Map<string, AgentSession>();
  const outputs: string[] = []; // each finished step's output file
  let current = -1;

  const session = async (name: string): Promise<{ session: AgentSession; fresh: boolean }> => {
    const open = sessions.get(name);
    if (open) return { session: open, fresh: false };
    const herdrName = herdrAgentName(run.id, Object.keys(task.agents).indexOf(name), name);
    const opened = await openAgentSession({ agent: task.agents[name], herdrName, label: `joey:${task.slug}:${name}`, cwd: taskDir, sessionsDir: join(run.runDir, "sessions"), env, mcpServers: loadMcpServers().servers });
    sessions.set(name, opened);
    return { session: opened, fresh: true };
  };

  const talk = async (s: AgentSession, text: string, timeoutMs: number): Promise<string> => {
    const { reply, transcript } = await ask(s, text, timeoutMs);
    note(`\n[${s.agent}]\n${transcript}`);
    return reply;
  };

  /** The previous step's output for an agent's message: pasted when short, referenced by path when long. */
  const inputFor = (i: number): string => {
    if (i < 0) return "";
    const content = readFileSync(outputs[i], "utf8");
    const body = content.length > INLINE_LIMIT ? `It is too long to include here — read it from ${outputs[i]}.` : content || "(empty)";
    return template("step-input", { step: i + 1, label: stepLabel(task.steps[i], task), content: body });
  };

  const runScript = async (i: number, step: Extract<StepDef, { kind: "script" }>, outFile: string): Promise<string> => {
    const script = loadScripts().scripts[step.script];
    const command = resolve(/* turbopackIgnore: true */ joeyHome(), script.command);
    const logFile = stepFile(run.runDir, i, step, ".log");
    const stepEnv: Record<string, string> = { ...env, STEP_OUTPUT: outFile, JOEY_PARAMS: JSON.stringify(step.params) };
    if (i > 0) stepEnv.STEP_INPUT = outputs[i - 1];
    const { exitCode, timedOut } = await herdr.runInTab(taskDir, `joey:${task.slug}:${step.script}`, scriptCommandLine(command, stepEnv, logFile), step.timeoutMs);
    const output = existsSync(logFile) ? readFileSync(logFile, "utf8").trim() : "";
    if (output) note(output);
    if (timedOut) throw new Error(`script ${step.script} timed out`);
    if (exitCode !== 0) throw new Error(`script ${step.script} exited with code ${exitCode}`);
    return existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  };

  /** The reviewer's verdict for the turn it just finished, reminding it once if it didn't call task_review_verdict. */
  const verdictOf = async (s: AgentSession, timeoutMs: number): Promise<{ verdict: "approve" | "revise"; feedback: string }> => {
    for (let attempt = 0; ; attempt++) {
      if (existsSync(s.verdictFile)) {
        const v = JSON.parse(readFileSync(s.verdictFile, "utf8"));
        rmSync(s.verdictFile);
        return { verdict: v.verdict === "approve" ? "approve" : "revise", feedback: String(v.feedback ?? "") };
      }
      if (attempt === 1) throw new Error(`agent ${s.agent} never called task_review_verdict`);
      await talk(s, template("verdict-reminder"), timeoutMs);
    }
  };

  const runAgent = async (i: number, step: Extract<StepDef, { kind: "agent" }>): Promise<string> => {
    const { session: s, fresh } = await session(step.agent);
    const briefing = fresh ? `${readFileSync(promptPath(task.agents[step.agent].prompt), "utf8").trim()}\n\n---\n\n` : "";
    const reviewed = step.reviews;
    const input = inputFor(reviewed ?? i - 1);
    const review = reviewed === undefined ? "" : template("review", { target: (task.steps[reviewed] as { agent: string }).agent, step: reviewed + 1 });
    const files = outputs.map((f, j) => `- step ${j + 1} (${stepLabel(task.steps[j], task)}): ${f}`).join("\n");
    const earlier = files ? template("step-earlier", { files }) : "";
    const text = briefing + template("step", { instruction: stepInstruction(step) + review, runDir: run.runDir, taskDir, earlier, input });
    if (reviewed === undefined) return talk(s, text, step.timeoutMs);

    // Review loop: the reviewer's feedback goes into the reviewed agent's own session, its revision back to the reviewer, until approved or out of rounds.
    rmSync(s.verdictFile, { force: true });
    await talk(s, text, step.timeoutMs);
    const target = sessions.get((task.steps[reviewed] as { agent: string }).agent)!;
    let work = readFileSync(outputs[reviewed], "utf8");
    for (let round = 1; ; round++) {
      const { verdict, feedback } = await verdictOf(s, step.timeoutMs);
      if (verdict === "approve") {
        note(`\nApproved in round ${round}.`);
        updateRunStep(run.id, i, { status: "running", note: `approved in round ${round}` });
        return work;
      }
      if (round >= step.maxRounds) {
        note(`\nNot approved after ${step.maxRounds} round(s) — carrying on with the latest version.`);
        updateRunStep(run.id, i, { status: "running", note: `not approved after ${step.maxRounds} round(s)` });
        return work;
      }
      const vars = { round, maxRounds: step.maxRounds, target: target.agent };
      work = await talk(target, template("review-feedback", { ...vars, feedback }), step.timeoutMs);
      writeFileSync(stepFile(run.runDir, reviewed, task.steps[reviewed], `.r${round + 1}.md`), work);
      await talk(s, template("review-again", { ...vars, round: round + 1, content: work }), step.timeoutMs);
    }
  };

  try {
    for (const [i, step] of task.steps.entries()) {
      current = i;
      const outFile = stepFile(run.runDir, i, step);
      updateRunStep(run.id, i, { status: "running", outputFile: outFile });
      note(`\n## Step ${i + 1}: ${stepLabel(step, task)}`);
      const output = step.kind === "script" ? await runScript(i, step, outFile) : await runAgent(i, step);
      writeFileSync(outFile, output);
      outputs.push(outFile);
      updateRunStep(run.id, i, { status: "completed" });
    }
    // task_send_result writes result.md itself (and emails it); otherwise the last step's output is the result.
    const result = join(run.runDir, "result.md");
    if (!existsSync(result) && outputs.length > 0) copyFileSync(outputs.at(-1)!, result);
    finishTaskRun(run.id, "completed");
    rlog.info({ slug: task.slug, runId: run.id }, "run completed");
  } catch (err) {
    if (current >= 0) updateRunStep(run.id, current, { status: "failed", note: errMsg(err) });
    skipPendingSteps(run.id);
    note(`\nFailed: ${errMsg(err)}`);
    finishTaskRun(run.id, "failed", errMsg(err));
    rlog.error({ slug: task.slug, runId: run.id, step: current + 1, err: errMsg(err) }, "run failed");
  } finally {
    await Promise.all([...sessions.values()].map(closeAgentSession));
  }
}
