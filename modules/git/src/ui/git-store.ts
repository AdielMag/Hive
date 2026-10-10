/**
 * Git repository sync status store.
 * Tracks ahead/behind counts for the rail badge (and the panels that refresh it).
 */
import { create } from "zustand";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { gitApi, gitHostOrNull } from "./git-host.ts";

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
    const project = gitHostOrNull()?.sessions.activeProject();
    if (!project?.path) {
      set({ status: null, loading: false });
      return;
    }
    if (get().loading) return;
    set({ loading: true });
    try {
      const res = await gitApi().getGitStatus(project.path);
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
let fetchTimer: ReturnType<typeof setInterval> | undefined;

/** Background remote fetch tuning: infrequent, throttled, backs off on failure. */
const FETCH_INTERVAL_MS = 5 * 60_000;
const FETCH_MIN_GAP_MS = 2 * 60_000;
const FETCH_MAX_BACKOFF_MS = 30 * 60_000;
const lastFetchAt = new Map<string, number>();
const failCount = new Map<string, number>();
let fetching = false;

/**
 * `git fetch` the active project (silent), then refresh status so ahead/behind updates.
 * Throttled per project; exponential backoff after failures (offline, auth, no remote).
 */
async function backgroundFetch(host: ModuleHost, force = false): Promise<void> {
  const path = host.sessions.activeProject()?.path;
  const status = useGitStore.getState().status;
  if (!path || fetching || (status && !status.upstream)) return;
  const fails = failCount.get(path) ?? 0;
  const gap = Math.min(FETCH_MIN_GAP_MS * 2 ** fails, FETCH_MAX_BACKOFF_MS);
  if (!force && Date.now() - (lastFetchAt.get(path) ?? 0) < gap) return;
  fetching = true;
  lastFetchAt.set(path, Date.now());
  try {
    await gitApi().gitFetch(path);
    failCount.delete(path);
    await useGitStore.getState().refreshGit();
  } catch {
    failCount.set(path, fails + 1);
  } finally {
    fetching = false;
  }
}

/**
 * Start background Git status tracking.
 * Refreshes when the active project changes, the window gains focus, or on an interval.
 */
export function startGitStatusWatcher(host: ModuleHost): () => void {
  if (watcherStarted || typeof window === "undefined") return () => {};
  watcherStarted = true;

  void useGitStore.getState().refreshGit().then(() => backgroundFetch(host));

  let lastPath = host.sessions.activeProject()?.path;
  const offTabs = host.tabs.onChange(() => {
    const path = host.sessions.activeProject()?.path;
    if (path !== lastPath) {
      lastPath = path;
      void useGitStore.getState().refreshGit().then(() => backgroundFetch(host));
    }
  });

  fetchTimer = setInterval(() => {
    if (document.visibilityState === "visible") void backgroundFetch(host);
  }, FETCH_INTERVAL_MS);

  checkTimer = setInterval(() => {
    void useGitStore.getState().refreshGit();
  }, 20_000);

  const onFocus = () => {
    if (Date.now() - useGitStore.getState().lastCheckedAt >= 3_000) {
      void useGitStore.getState().refreshGit();
    }
    void backgroundFetch(host); // throttled by FETCH_MIN_GAP_MS
  };
  window.addEventListener("focus", onFocus);

  return () => {
    watcherStarted = false;
    offTabs();
    if (checkTimer) clearInterval(checkTimer);
    checkTimer = undefined;
    if (fetchTimer) clearInterval(fetchTimer);
    fetchTimer = undefined;
    window.removeEventListener("focus", onFocus);
    useGitStore.setState({ status: null, loading: false });
  };
}
