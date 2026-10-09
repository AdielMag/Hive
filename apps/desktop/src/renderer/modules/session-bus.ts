/**
 * Fan-out of Pi session stream events to modules (`host.sessions.onEvent`). Core's session store calls
 * `emitSessionEvents`; it never needs to know which modules listen.
 */
import type { ModuleSessionEvent } from "@hive/module-sdk/renderer";

type Listener = (evt: ModuleSessionEvent) => void;
const listeners = new Set<Listener>();

export function subscribeSessionEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSessionEvents(key: string, active: boolean, events: ReadonlyArray<{ type: string; [k: string]: unknown }>): void {
  if (listeners.size === 0) return;
  for (const event of events) {
    for (const l of [...listeners]) {
      try {
        l({ key, active, event });
      } catch (err) {
        console.error("[modules] session listener failed", err);
      }
    }
  }
}

type UserWaitResolver = (call: { name: string; arguments: Record<string, unknown> }) => boolean;
let userWaitResolver: UserWaitResolver | null = null;

/** The module registry installs this: does a tool call belong to a module card that blocks on the user? */
export function setUserWaitResolver(resolver: UserWaitResolver | null): void {
  userWaitResolver = resolver;
}

export function toolAwaitsUser(name: string, args: unknown): boolean {
  if (!userWaitResolver) return false;
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  try {
    return userWaitResolver({ name, arguments: a });
  } catch {
    return false;
  }
}
