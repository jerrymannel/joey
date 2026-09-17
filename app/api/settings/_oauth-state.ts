import { randomBytes } from "node:crypto";

export type GoogleService = "gmail" | "youtube";

/**
 * One-shot CSRF tokens for the OAuth redirect round-trip, each tagged with the service that
 * started it so the single `/api/settings/google/callback` route knows which one to finish.
 * Process-local: fine for a single-user local app.
 */
const pendingStates = new Map<string, GoogleService>();

export function createState(service: GoogleService): string {
  const state = randomBytes(16).toString("hex");
  pendingStates.set(state, service);
  return state;
}

/** Returns the service that started this state's flow, or null if it's missing/expired. */
export function consumeState(state: string | null): GoogleService | null {
  if (!state) return null;
  const service = pendingStates.get(state);
  if (!service) return null;
  pendingStates.delete(state);
  return service;
}
