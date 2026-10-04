/**
 * Insights state: the usage report. (Subscription quota lives in the `limits` module.)
 */
import { create } from "zustand";
import type { UsageReport } from "@hive/protocol";

interface InsightsState {
  usage: UsageReport | null;
  usageLoading: boolean;
  usageError: string | null;
  /** Session file path the Usage view is scoped to; null = all sessions. */
  focusSession: string | null;
  setFocusSession(path: string | null): void;
  refreshUsage(force?: boolean): Promise<void>;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const useInsights = create<InsightsState>((set, get) => ({
  usage: null,
  usageLoading: false,
  usageError: null,
  focusSession: null,
  setFocusSession: (path) => set({ focusSession: path }),

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
