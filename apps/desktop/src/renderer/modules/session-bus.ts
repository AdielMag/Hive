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
