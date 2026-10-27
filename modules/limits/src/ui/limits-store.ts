/**
 * Subscription quota snapshot. Polling is owned by the module: it starts in `activate` and stops when the
 * module is disabled, so a disabled module costs no network or timers.
 */
import { useEffect, useReducer } from "react";
import { create } from "zustand";
import type { QuotaSnapshot } from "@hive/protocol";
import { LimitsMethods } from "../shared.ts";
import { limitsHost } from "./limits-host.ts";

interface LimitsState {
  quota: QuotaSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh(force?: boolean): Promise<void>;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

let inflight: Promise<void> | null = null;
let inflightForced = false;

export const useLimits = create<LimitsState>((set) => {
  const run = async (force: boolean) => {
    set({ loading: true, error: null });
    try {
      set({ quota: await limitsHost().ipc.invoke<QuotaSnapshot>(LimitsMethods.get, { force }) });
    } catch (err) {
      set({ error: message(err) });
    } finally {
      set({ loading: false });
    }
  };
  return {
    quota: null,
    loading: false,
    error: null,
    refresh: async (force = false) => {
      // Background polls coalesce; a manual (forced) refresh is never swallowed by one in flight.
      if (inflight && !(force && !inflightForced)) return inflight;
      if (inflight) await inflight;
      inflightForced = force;
      const p: Promise<void> = run(force).finally(() => {
        if (inflight === p) inflight = null;
      });
      inflight = p;
      return p;
    },
  };
});

export const POLL_MS = 120_000;
const STALE_MS = 60_000;

/** Fetch now (if stale) and then every POLL_MS. Returns a disposer. */
export function startQuotaPolling(): () => void {
  const s = useLimits.getState();
  if (!s.quota || Date.now() - s.quota.fetchedAt > STALE_MS) void s.refresh();
  const timer = setInterval(() => void useLimits.getState().refresh(), POLL_MS);
  return () => clearInterval(timer);
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
