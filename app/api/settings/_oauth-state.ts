import { randomBytes } from "node:crypto";

export type GoogleService = "gmail" | "youtube";

/**
 * One-shot CSRF tokens for the OAuth redirect round-trip, each tagged with the service that
 * started it so the single `/api/settings/google/callback` route knows which one to finish.
 * Process-local: fine for a single-user local app.
 */
const pendingStates = new Map<string, { service: GoogleService; mailbox: boolean }>();

/** `mailbox`: the connected account becomes the agent mailbox (General settings) once the flow finishes. */
export function createState(service: GoogleService, mailbox = false): string {
  const state = randomBytes(16).toString("hex");
  pendingStates.set(state, { service, mailbox });
  return state;
}

/** Returns the flow this state started, or null if it's missing/expired. */
export function consumeState(state: string | null): { service: GoogleService; mailbox: boolean } | null {
  if (!state) return null;
  const flow = pendingStates.get(state);
  if (!flow) return null;
  pendingStates.delete(state);
  return flow;
}
