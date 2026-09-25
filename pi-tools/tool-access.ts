/**
 * Throws unless the running agent was given this tool in its task file — task-run.ts exports the agent's `tools:` as JOEY_TOOLS. pi registers
 * every tool for every agent, so tools with real reach check for themselves.
 */
export function requireToolEnabled(name: string): void {
  if (!(process.env.JOEY_TOOLS ?? "").split(",").includes(name)) throw new Error(`the ${name} tool isn't enabled for this agent — add it to the agent's tools in its task file`);
}
