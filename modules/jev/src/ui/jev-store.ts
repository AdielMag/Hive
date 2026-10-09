/**
 * Tiny external store (no extra deps) for Jev's per-session compaction advice. Fed from the bridge's
 * `jev_advice` records and Pi's agent/compaction stream events (see renderer.tsx).
 *
 * It also tracks each hint's life (advice → shown → compact | dismiss | ignored, plus manualCompact) and reports it
 * through an injectable sink (renderer.tsx wires it to the main-process `logEvent` IPC). Tracking lives outside the
 * React-visible state so subscribers don't re-render on bookkeeping.
 */
import { useSyncExternalStore } from "react";
import type { JevAdvice, JevEvent } from "../shared.ts";
import { decideTier, type CompactTier } from "../tiering.ts";

interface State {
  /** Newest advice per session key. */
  advice: Readonly<Record<string, JevAdvice>>;
  /** Entry id the user dismissed, per session key. */
  dismissed: Readonly<Record<string, string>>;
  /** Session keys with a compaction we asked for in flight (value: when it started). */
  compacting: Readonly<Record<string, number>>;
}

export type JevEventSink = (event: JevEvent) => void;

/** Life of the newest advice of one session. */
interface HintTrack {
  entryId: string;
  /** Tier the hint was shown with (undefined until shown). */
  shownTier?: CompactTier;
  /** A compact/dismiss/ignored event was already logged for it. */
  resolved: boolean;
}

let state: State = { advice: {}, dismissed: {}, compacting: {} };
const listeners = new Set<() => void>();
let sink: JevEventSink | null = null;
const tracks = new Map<string, HintTrack>();
/** Context window of the last advice per session; survives clearAdvice so a later compaction can be put in context. */
const lastWindow = new Map<string, number>();

function set(next: State): void {
  state = next;
  for (const l of [...listeners]) l();
}

function emit(event: Omit<JevEvent, "ts">): void {
  try {
    sink?.({ ts: Date.now(), ...event });
  } catch {
    // Telemetry must never break the hint UI.
  }
}

/** A shown hint that was never acted on has been superseded. */
function settleIgnored(key: string, advice: JevAdvice | undefined): void {
  const t = tracks.get(key);
  if (t && t.shownTier && !t.resolved) {
    t.resolved = true;
    emit({ kind: "ignored", key, entryId: t.entryId, tier: t.shownTier, usagePct: advice?.entryId === t.entryId ? advice.usagePct : undefined });
  }
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
  /** Where funnel events go (null = drop them). */
  setEventSink(next: JevEventSink | null): void {
    sink = next;
  },
  setAdvice(key: string, advice: JevAdvice) {
    const prev = state.advice[key];
    if (prev && prev.entryId !== advice.entryId) settleIgnored(key, prev);
    if (!prev || prev.entryId !== advice.entryId) {
      tracks.set(key, { entryId: advice.entryId, resolved: false });
      emit({
        kind: "advice",
        key,
        entryId: advice.entryId,
        tier: decideTier({ advice, idleMs: Math.max(0, Date.now() - advice.at), floorPct: 0 }).tier,
        usagePct: advice.usagePct,
        signals: advice.signals,
      });
    }
    lastWindow.set(key, advice.contextWindow);
    set({ ...state, advice: { ...state.advice, [key]: advice } });
  },
  /** The hint bar is on screen with a non-silent tier. Logged once per advice entry. */
  markShown(key: string, tier: CompactTier) {
    const a = state.advice[key];
    const t = tracks.get(key);
    if (!a || !t || t.entryId !== a.entryId || t.shownTier || tier === "silent") return;
    t.shownTier = tier;
    emit({ kind: "shown", key, entryId: a.entryId, tier, usagePct: a.usagePct });
  },
  /** A new turn started or the context was compacted: old advice no longer describes the conversation. */
  clearAdvice(key: string) {
    settleIgnored(key, state.advice[key]);
    tracks.delete(key);
    set({ ...state, advice: without(state.advice, key), compacting: without(state.compacting, key) });
  },
  dismiss(key: string) {
    const a = state.advice[key];
    if (a) {
      const t = tracks.get(key);
      if (t && t.entryId === a.entryId && !t.resolved) {
        t.resolved = true;
        emit({ kind: "dismiss", key, entryId: a.entryId, tier: t.shownTier, usagePct: a.usagePct });
      }
      set({ ...state, dismissed: { ...state.dismissed, [key]: a.entryId } });
    }
  },
  /** The user pressed Compact on the hint: logs `compact` and shows the busy state. */
  requestCompact(key: string, now = Date.now()) {
    const a = state.advice[key];
    const t = tracks.get(key);
    if (a && t && t.entryId === a.entryId && !t.resolved) {
      t.resolved = true;
      emit({ kind: "compact", key, entryId: a.entryId, tier: t.shownTier, usagePct: a.usagePct });
    }
    set({ ...state, compacting: { ...state.compacting, [key]: now } });
  },
  /**
   * Pi finished a compaction (`compaction_end`). Call before clearAdvice. Aborted/failed ones are ignored. With a hint
   * showing the compaction counts as acting on it; one we started is already logged; anything else is a manualCompact.
   */
  compactionEnded(key: string, e: { aborted?: unknown; errorMessage?: unknown; reason?: unknown; result?: unknown; [k: string]: unknown }) {
    if (e.aborted || e.errorMessage) return;
    const tokensBefore = (e.result as { tokensBefore?: unknown } | null | undefined)?.tokensBefore;
    const before = typeof tokensBefore === "number" ? tokensBefore : undefined;
    const t = tracks.get(key);
    const a = state.advice[key];
    if (key in state.compacting) return;
    if (a && t && t.entryId === a.entryId && t.shownTier) {
      if (!t.resolved) {
        t.resolved = true;
        emit({ kind: "compact", key, entryId: a.entryId, tier: t.shownTier, usagePct: a.usagePct, tokensBefore: before });
      }
      return;
    }
    const window = lastWindow.get(key);
    const usagePct = before !== undefined && window ? (before / window) * 100 : a?.usagePct;
    emit({ kind: "manualCompact", key, usagePct, tokensBefore: before, reason: typeof e.reason === "string" ? e.reason : undefined });
  },
  startCompacting: (key: string, now = Date.now()) => set({ ...state, compacting: { ...state.compacting, [key]: now } }),
  stopCompacting: (key: string) => set({ ...state, compacting: without(state.compacting, key) }),
  reset() {
    for (const [key, a] of Object.entries(state.advice)) settleIgnored(key, a);
    tracks.clear();
    lastWindow.clear();
    set({ advice: {}, dismissed: {}, compacting: {} });
  },
};

export function useJev(): State {
  return useSyncExternalStore(jevStore.subscribe, jevStore.get, jevStore.get);
}
