/**
 * Actions store: repo resolution, run list (filters + paging), per-run jobs, and the polling scheduler.
 * Polling is cheap (ETag/304) and adaptive: fast while a run is active and the panel is open, slow otherwise.
 */
import { create } from "zustand";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import type {
  ActionsErrorCode,
  ActionsJob,
  ActionsRepo,
  ActionsRun,
  ActionsWorkflow,
  RunStatusFilter,
} from "../shared.ts";
import { actionsApi } from "./actions-host.ts";

export const PAGE_SIZE = 30;
const FAST_MS = 5_000;
const SLOW_MS = 30_000;
const NO_TOKEN_MS = 60_000;
const ERROR_MS = 60_000;

export interface ActionsFilters {
  status: RunStatusFilter;
  /** "all" or "current" (the branch checked out in the project). */
  branch: "all" | "current";
  workflowId: number | null;
}

export interface ActionsError {
  code: ActionsErrorCode;
  message: string;
}

export interface ActionsState {
  projectPath: string | null;
  repo: ActionsRepo | null;
  workflows: ActionsWorkflow[];
  runs: ActionsRun[];
  totalCount: number;
  page: number;
  filters: ActionsFilters;
  loading: boolean;
  loadingMore: boolean;
  error: ActionsError | null;
  lastFetchedAt: number;
  expandedRunId: number | null;
  jobs: Record<number, ActionsJob[]>;
  /** Number of mounted panels; the scheduler polls fast only while > 0. */
  panelMounts: number;
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  loadMore: () => Promise<void>;
  setFilters: (patch: Partial<ActionsFilters>) => void;
  toggleRun: (runId: number) => void;
  saveToken: (token: string) => Promise<void>;
  clearToken: () => Promise<void>;
}

const initialFilters: ActionsFilters = { status: "all", branch: "all", workflowId: null };

let hostRef: ModuleHost | null = null;
let generation = 0;

export function isActiveState(s: ActionsRun["state"]): boolean {
  return s === "running" || s === "queued";
}

/** Pure: how long to wait before the next poll. */
export function pollInterval(opts: { hasActive: boolean; panelOpen: boolean; hasToken: boolean; error: boolean }): number {
  if (opts.error) return ERROR_MS;
  const base = opts.hasActive && opts.panelOpen ? FAST_MS : SLOW_MS;
  return opts.hasToken ? base : Math.max(base, NO_TOKEN_MS);
}

function queryFor(s: Pick<ActionsState, "filters" | "repo">, page: number) {
  const { filters, repo } = s;
  return {
    page,
    perPage: PAGE_SIZE,
    status: filters.status,
    workflowId: filters.workflowId ?? undefined,
    branch: filters.branch === "current" ? repo?.branch : undefined,
  };
}

export const useActionsStore = create<ActionsState>((set, get) => ({
  projectPath: null,
  repo: null,
  workflows: [],
  runs: [],
  totalCount: 0,
  page: 1,
  filters: initialFilters,
  loading: false,
  loadingMore: false,
  error: null,
  lastFetchedAt: 0,
  expandedRunId: null,
  jobs: {},
  panelMounts: 0,

  refresh: async (opts) => {
    const project = hostRef?.sessions.activeProject();
    const gen = ++generation;
    if (!project?.path) {
      set({ projectPath: null, repo: null, runs: [], workflows: [], totalCount: 0, error: null, loading: false, jobs: {}, expandedRunId: null });
      return;
    }
    const projectChanged = project.path !== get().projectPath;
    if (projectChanged) {
      set({ projectPath: project.path, repo: null, runs: [], workflows: [], totalCount: 0, jobs: {}, expandedRunId: null, filters: initialFilters, error: null });
    }
    if (!opts?.silent || projectChanged) set({ loading: true });

    const api = actionsApi();
    // Re-resolve the repo every refresh: cheap (local git) and picks up branch / token changes.
    const repoRes = await api.repo(project.path);
    if (gen !== generation) return;
    if (!repoRes.ok) {
      set({ repo: null, runs: [], totalCount: 0, loading: false, error: { code: repoRes.code, message: repoRes.message }, lastFetchedAt: Date.now() });
      return;
    }
    const repo = repoRes.data;
    set({ repo });

    const [runsRes, wfRes] = await Promise.all([
      api.runs(repo, queryFor({ filters: get().filters, repo }, 1)),
      get().workflows.length === 0 ? api.workflows(repo) : Promise.resolve(null),
    ]);
    if (gen !== generation) return;
    if (!runsRes.ok) {
      set({ loading: false, error: { code: runsRes.code, message: runsRes.message }, lastFetchedAt: Date.now() });
      return;
    }
    // Keep already-loaded extra pages so a poll does not collapse "Load more" results.
    const loaded = get().runs;
    const fresh = runsRes.data.runs;
    const freshIds = new Set(fresh.map((r) => r.id));
    const tail = get().page > 1 ? loaded.filter((r) => !freshIds.has(r.id) && r.id < (fresh[fresh.length - 1]?.id ?? 0)) : [];
    set({
      runs: [...fresh, ...tail],
      totalCount: runsRes.data.totalCount,
      workflows: wfRes?.ok ? wfRes.data : get().workflows,
      loading: false,
      error: null,
      lastFetchedAt: Date.now(),
    });

    const expanded = get().expandedRunId;
    if (expanded !== null) {
      const jobsRes = await api.jobs(repo, expanded);
      if (gen === generation && jobsRes.ok) set({ jobs: { ...get().jobs, [expanded]: jobsRes.data } });
    }
  },

  loadMore: async () => {
    const { repo, loadingMore, runs, totalCount, page } = get();
    if (!repo || loadingMore || runs.length >= totalCount) return;
    set({ loadingMore: true });
    const res = await actionsApi().runs(repo, queryFor(get(), page + 1));
    if (!res.ok) {
      set({ loadingMore: false, error: { code: res.code, message: res.message } });
      return;
    }
    const seen = new Set(get().runs.map((r) => r.id));
    set({ runs: [...get().runs, ...res.data.runs.filter((r) => !seen.has(r.id))], page: page + 1, loadingMore: false });
  },

  setFilters: (patch) => {
    set({ filters: { ...get().filters, ...patch }, page: 1, runs: [], totalCount: 0, loading: true });
    void get().refresh();
  },

  toggleRun: (runId) => {
    const next = get().expandedRunId === runId ? null : runId;
    set({ expandedRunId: next });
    const { repo } = get();
    if (next === null || !repo) return;
    void actionsApi()
      .jobs(repo, next)
      .then((res) => {
        if (res.ok) set({ jobs: { ...get().jobs, [next]: res.data } });
      });
  },

  saveToken: async (token) => {
    await actionsApi().setToken(token);
    await get().refresh();
  },

  clearToken: async () => {
    await actionsApi().clearToken();
    await get().refresh();
  },
}));

/** Starts the scheduler (1s tick): refreshes on project change, then on the adaptive interval. Returns a stopper. */
export function startActionsPolling(host: ModuleHost): () => void {
  hostRef = host;
  let nextAt = 0;
  let inFlight = false;
  const tick = async () => {
    if (inFlight) return;
    const s = useActionsStore.getState();
    const path = host.sessions.activeProject()?.path ?? null;
    const due = path !== s.projectPath || Date.now() >= nextAt;
    if (!due || (typeof document !== "undefined" && document.hidden && path === s.projectPath)) return;
    inFlight = true;
    try {
      await s.refresh({ silent: true });
    } finally {
      inFlight = false;
      const cur = useActionsStore.getState();
      nextAt =
        Date.now() +
        pollInterval({
          hasActive: cur.runs.some((r) => isActiveState(r.state)),
          panelOpen: cur.panelMounts > 0,
          hasToken: (cur.repo?.tokenSource ?? "none") !== "none",
          error: cur.error !== null,
        });
    }
  };
  const timer = setInterval(() => void tick(), 1000);
  void tick();
  return () => {
    clearInterval(timer);
    hostRef = null;
    generation++;
    useActionsStore.setState({ projectPath: null, repo: null, runs: [], jobs: {}, workflows: [], error: null });
  };
}

export function setPanelMounted(delta: 1 | -1): void {
  useActionsStore.setState((s) => ({ panelMounts: Math.max(0, s.panelMounts + delta) }));
}
