/**
 * Git repository sync status store.
 * Tracks ahead/behind counts for push and pull indicators across the workbench shell.
 */
import { create } from "zustand";
import { useSessionStore } from "./session-store.ts";

export interface GitSyncInfo {
  ahead: number;
  behind: number;
  branch: string;
  upstream?: string;
  isRepo: boolean;
}

export interface GitState {
  status: GitSyncInfo | null;
  loading: boolean;
  lastCheckedAt: number;
  refreshGit: () => Promise<void>;
  setStatus: (status: GitSyncInfo | null) => void;
}

export const useGitStore = create<GitState>((set, get) => ({
  status: null,
  loading: false,
  lastCheckedAt: 0,
  setStatus: (status) => set({ status, lastCheckedAt: Date.now() }),
  refreshGit: async () => {
    const activeProject = useSessionStore.getState().activeProject;
    if (!activeProject?.path || typeof window === "undefined" || !window.studio?.getGitStatus) {
      set({ status: null, loading: false });
      return;
    }
    if (get().loading) return;
    set({ loading: true });
    try {
      const res = await window.studio.getGitStatus(activeProject.path);
      if (res && res.isRepo) {
        set({
          status: {
            ahead: res.ahead ?? 0,
            behind: res.behind ?? 0,
            branch: res.branch ?? "",
            upstream: res.upstream,
            isRepo: true,
          },
          loading: false,
          lastCheckedAt: Date.now(),
        });
      } else {
        set({ status: null, loading: false, lastCheckedAt: Date.now() });
      }
    } catch {
      set({ status: null, loading: false, lastCheckedAt: Date.now() });
    }
  },
}));

let watcherStarted = false;
let checkTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Start background Git status tracking.
 * Refreshes when active project changes, window gains focus, or on interval.
 */
export function startGitStatusWatcher(): () => void {
  if (watcherStarted || typeof window === "undefined") return () => {};
  watcherStarted = true;

  // Immediate check
  void useGitStore.getState().refreshGit();

  // Project switch listener
  const unsubSession = useSessionStore.subscribe((state, prev) => {
    if (state.activeProject?.path !== prev.activeProject?.path) {
      void useGitStore.getState().refreshGit();
    }
  });

  // Background interval polling (every 20s)
  checkTimer = setInterval(() => {
    void useGitStore.getState().refreshGit();
  }, 20_000);

  // Focus listener
  const onFocus = () => {
    if (Date.now() - useGitStore.getState().lastCheckedAt >= 3_000) {
      void useGitStore.getState().refreshGit();
    }
  };
  window.addEventListener("focus", onFocus);

  return () => {
    watcherStarted = false;
    unsubSession();
    if (checkTimer) clearInterval(checkTimer);
    window.removeEventListener("focus", onFocus);
  };
}
