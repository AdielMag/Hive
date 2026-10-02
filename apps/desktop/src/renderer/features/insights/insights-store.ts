/**
 * Insights state: subscription quota snapshot + usage report. Quota refreshes on a timer only while
 * something on screen subscribes to it (Limits panel, status bar meter), so an idle app does no polling.
 */
import { useEffect, useReducer } from "react";
import { create } from "zustand";
import type { QuotaSnapshot, UsageReport } from "@hive/protocol";

interface InsightsState {
  quota: QuotaSnapshot | null;
  quotaLoading: boolean;
  quotaError: string | null;
  usage: UsageReport | null;
  usageLoading: boolean;
  usageError: string | null;
  /** Session file path the Usage view is scoped to; null = all sessions. */
  focusSession: string | null;
  setFocusSession(path: string | null): void;
  refreshQuota(force?: boolean): Promise<void>;
  refreshUsage(force?: boolean): Promise<void>;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const useInsights = create<InsightsState>((set, get) => ({
  quota: null,
  quotaLoading: false,
  quotaError: null,
  usage: null,
  usageLoading: false,
  usageError: null,
  focusSession: null,
  setFocusSession: (path) => set({ focusSession: path }),

  refreshQuota: async (force) => {
    if (get().quotaLoading) return;
    set({ quotaLoading: true, quotaError: null });
    try {
      set({ quota: await window.studio.getQuota(force) });
    } catch (err) {
      set({ quotaError: message(err) });
    } finally {
      set({ quotaLoading: false });
    }
  },

  refreshUsage: async (force) => {
    if (get().usageLoading) return;
    set({ usageLoading: true, usageError: null });
    try {
      set({ usage: await window.studio.getUsage(force) });
    } catch (err) {
      set({ usageError: message(err) });
    } finally {
      set({ usageLoading: false });
    }
  },
}));

let subscribers = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const POLL_MS = 120_000;

/** Keep quota fresh while the calling component is mounted. */
export function useQuotaPolling(): void {
  useEffect(() => {
    subscribers++;
    if (subscribers === 1) {
      const s = useInsights.getState();
      if (!s.quota || Date.now() - s.quota.fetchedAt > 60_000) void s.refreshQuota();
      timer = setInterval(() => void useInsights.getState().refreshQuota(), POLL_MS);
    }
    return () => {
      subscribers--;
      if (subscribers === 0) clearInterval(timer);
    };
  }, []);
}

/** Re-render every `ms` so countdowns stay live. */
export function useNow(ms = 30_000): number {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const t = setInterval(force, ms);
    return () => clearInterval(t);
  }, [ms, force]);
  return Date.now();
}
