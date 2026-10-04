/**
 * Tiny external store (no extra deps) for Jev's per-session compaction advice. Fed from the bridge's
 * `jev_advice` records and Pi's agent/compaction stream events (see renderer.tsx).
 */
import { useSyncExternalStore } from "react";
import type { JevAdvice } from "../shared.ts";

interface State {
  /** Newest advice per session key. */
  advice: Readonly<Record<string, JevAdvice>>;
  /** Entry id the user dismissed, per session key. */
  dismissed: Readonly<Record<string, string>>;
  /** Session keys with a compaction we asked for in flight (value: when it started). */
  compacting: Readonly<Record<string, number>>;
}

let state: State = { advice: {}, dismissed: {}, compacting: {} };
const listeners = new Set<() => void>();

function set(next: State): void {
  state = next;
  for (const l of [...listeners]) l();
}

const without = <T>(rec: Readonly<Record<string, T>>, key: string): Record<string, T> => {
  if (!(key in rec)) return rec as Record<string, T>;
  const { [key]: _gone, ...rest } = rec;
  return rest;
};

export const jevStore = {
  get: (): State => state,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setAdvice: (key: string, advice: JevAdvice) => set({ ...state, advice: { ...state.advice, [key]: advice } }),
  /** A new turn started or the context was compacted: old advice no longer describes the conversation. */
  clearAdvice: (key: string) => set({ ...state, advice: without(state.advice, key), compacting: without(state.compacting, key) }),
  dismiss(key: string) {
    const a = state.advice[key];
    if (a) set({ ...state, dismissed: { ...state.dismissed, [key]: a.entryId } });
  },
  startCompacting: (key: string, now = Date.now()) => set({ ...state, compacting: { ...state.compacting, [key]: now } }),
  stopCompacting: (key: string) => set({ ...state, compacting: without(state.compacting, key) }),
  reset: () => set({ advice: {}, dismissed: {}, compacting: {} }),
};

export function useJev(): State {
  return useSyncExternalStore(jevStore.subscribe, jevStore.get, jevStore.get);
}
