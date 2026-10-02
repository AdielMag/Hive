/**
 * App update state shared by the title-bar badge and Settings → Updates.
 *
 * Previously the title bar checked once, 4s after launch, into local state: a release published while
 * the app was open (or a failed launch check) never surfaced until a restart, while Settings ran its own
 * separate check. Now there's one source of truth, re-checked periodically and when the window regains
 * focus, so any check (including Settings' "Check now") lights up the badge.
 */
import { create } from "zustand";
import type { UpdateProgress } from "@pi-studio/protocol";

export type { UpdateProgress };

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  downloadUrl?: string;
  releaseUrl?: string;
  notes?: string;
}

const FIRST_CHECK_DELAY_MS = 4_000;
const CHECK_INTERVAL_MS = 30 * 60_000;
/** Focus-triggered checks are throttled; GitHub allows 60 unauthenticated API calls per hour. */
const FOCUS_MIN_GAP_MS = 10 * 60_000;

interface UpdateState {
  info: UpdateInfo | null;
  checking: boolean;
  lastCheckedAt: number;
  /** Live state of a "Download & install" run; null when idle. */
  install: UpdateProgress | null;
  check(): Promise<void>;
  applyUpdate(): Promise<void>;
}

/** True while an install is in flight (button should be disabled, progress shown). */
export const isInstalling = (p: UpdateProgress | null): boolean => p?.phase === "downloading" || p?.phase === "launching";

export const useUpdates = create<UpdateState>((set, get) => ({
  info: null,
  checking: false,
  lastCheckedAt: 0,
  install: null,
  applyUpdate: async () => {
    const url = get().info?.downloadUrl;
    if (isInstalling(get().install)) return;
    set({ install: { phase: "downloading", received: 0 } });
    const off = window.studio.onUpdateProgress((install) => set({ install }));
    try {
      const res = await window.studio.applyUpdate(url);
      const cur = get().install;
      if (!res.success) set({ install: { phase: "error", received: 0, message: res.message } });
      // Opened in the browser (no in-app download): clear the progress UI after a moment.
      else if (cur?.phase === "browser" || cur?.phase === "error") setTimeout(() => set({ install: null }), 4_000);
    } catch (err) {
      set({ install: { phase: "error", received: 0, message: err instanceof Error ? err.message : String(err) } });
    } finally {
      off();
    }
  },
  check: async () => {
    if (get().checking) return;
    set({ checking: true });
    try {
      const info = (await window.studio.checkForUpdates()) as UpdateInfo | null;
      // A failed check returns hasUpdate:false without a latestVersion; don't let it hide a known update.
      if (info && (info.latestVersion || !get().info?.hasUpdate)) set({ info });
    } catch {
      // offline: keep previous info
    } finally {
      set({ checking: false, lastCheckedAt: Date.now() });
    }
  },
}));

let started = false;

/** Start background update checks (idempotent). Returns a stop function. */
export function startUpdateChecks(): () => void {
  if (started) return () => {};
  started = true;
  const check = () => void useUpdates.getState().check();
  const first = setTimeout(check, FIRST_CHECK_DELAY_MS);
  const interval = setInterval(check, CHECK_INTERVAL_MS);
  const onFocus = () => {
    if (Date.now() - useUpdates.getState().lastCheckedAt >= FOCUS_MIN_GAP_MS) check();
  };
  window.addEventListener("focus", onFocus);
  return () => {
    started = false;
    clearTimeout(first);
    clearInterval(interval);
    window.removeEventListener("focus", onFocus);
  };
}
