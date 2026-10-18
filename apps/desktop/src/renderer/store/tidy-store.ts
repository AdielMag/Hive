/** "Archive old" run: state shown in the Tidy tab + the pipeline (rules -> model batches -> archive -> worktree cleanup). */
import { create } from "zustand";
import type { SessionCatalogItem, TidyWorktreeCandidate } from "@hive/protocol";
import { useSessionStore } from "./session-store.ts";
import { sessionDisplayTitle } from "../lib/session-title.ts";
import { isSubagentSession, normPath } from "../lib/subagent-sessions.ts";
import { stopSessionTabs } from "./worktree-actions.ts";
import { toast } from "../modules/toast-store.ts";

export const TIDY_TAB_ID = "studio:tidy";

export type TidyPhase = "idle" | "scanning" | "asking" | "archiving" | "worktrees" | "done" | "cancelled" | "error";
export type TidyItemStatus = "queued" | "asking" | "archive" | "keep" | "archived" | "failed";
export type TidyChoice = "keep" | "local" | "all";

export interface TidyItem {
  path: string;
  title: string;
  modified: string;
  messageCount: number;
  status: TidyItemStatus;
  /** Why it was picked: a fixed rule or the model. */
  source?: "rule" | "model";
  hadTab: boolean;
  hasWorktree: boolean;
}

export interface TidyLogLine {
  at: number;
  text: string;
  kind?: "info" | "ok" | "warn";
}

export interface TidyOptions {
  /** Archive anything untouched for this many days without asking the model. 0 = off. */
  autoDays: number;
  /** Also consider sessions that have an idle open tab (the tab gets closed). */
  includeOpen: boolean;
  /** Also consider sessions that run in a worktree (the worktree itself is offered for cleanup afterwards). */
  includeWorktrees: boolean;
}

export interface WorktreePrompt {
  candidates: TidyWorktreeCandidate[];
  resolve: (choices: Record<string, TidyChoice> | null) => void;
}

interface TidyState {
  phase: TidyPhase;
  options: TidyOptions;
  items: TidyItem[];
  batchesTotal: number;
  batchesDone: number;
  log: TidyLogLine[];
  modelLabel: string;
  startedAt: number;
  finishedAt: number;
  worktreePrompt: WorktreePrompt | null;
  worktreesRemoved: number;
  cancelRequested: boolean;
}

export const useTidyStore = create<TidyState>(() => ({
  phase: "idle",
  options: { autoDays: 14, includeOpen: true, includeWorktrees: true },
  items: [],
  batchesTotal: 0,
  batchesDone: 0,
  log: [],
  modelLabel: "",
  startedAt: 0,
  finishedAt: 0,
  worktreePrompt: null,
  worktreesRemoved: 0,
  cancelRequested: false,
}));

const BATCH_SIZE = 40;
const BATCH_CONCURRENCY = 3;
/** Never touch sessions modified this recently. */
const FRESH_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const set = useTidyStore.setState;
const get = useTidyStore.getState;

function log(text: string, kind: TidyLogLine["kind"] = "info"): void {
  set((s) => ({ log: [...s.log, { at: Date.now(), text, kind }] }));
}

function patchItems(paths: Set<string>, patch: Partial<TidyItem>): void {
  set((s) => ({ items: s.items.map((i) => (paths.has(i.path) ? { ...i, ...patch } : i)) }));
}

export function setTidyOptions(patch: Partial<TidyOptions>): void {
  set((s) => ({ options: { ...s.options, ...patch } }));
}

export function isTidyBusy(): boolean {
  const p = get().phase;
  return p === "scanning" || p === "asking" || p === "archiving" || p === "worktrees";
}

export function openTidyTab(): void {
  const { tabs, activeProject } = useSessionStore.getState();
  if (!tabs.some((t) => t.id === TIDY_TAB_ID)) {
    useSessionStore.setState({
      tabs: [...tabs, { id: TIDY_TAB_ID, kind: "tidy", projectId: activeProject?.id ?? "", title: "Archive old", pinned: false }],
    });
  }
  void useSessionStore.getState().switchTab(TIDY_TAB_ID);
}

export function cancelTidy(): void {
  if (!isTidyBusy()) return;
  set({ cancelRequested: true });
  get().worktreePrompt?.resolve(null);
  log("Stopping after the current step…", "warn");
}

export function resolveWorktreePrompt(choices: Record<string, TidyChoice> | null): void {
  const p = get().worktreePrompt;
  if (!p) return;
  set({ worktreePrompt: null });
  p.resolve(choices);
}

function askWorktrees(candidates: TidyWorktreeCandidate[]): Promise<Record<string, TidyChoice> | null> {
  return new Promise((resolve) => set({ worktreePrompt: { candidates, resolve } }));
}

/** Tabs whose session we must not archive: running, awaiting input, or the tab the user is looking at. */
function protectedPaths(): Set<string> {
  const s = useSessionStore.getState();
  const out = new Set<string>();
  for (const t of s.tabs) {
    if (!t.sessionPath || (t.kind && t.kind !== "session")) continue;
    const busy =
      s.sessionActivity[t.id] === "running" ||
      !!s.sessionAwaitingUser[t.id] ||
      !!s.tabUi[t.id]?.pendingUiDialog ||
      !!s.tabUi[t.id]?.pendingForm;
    if (busy || t.id === s.activeTabId) out.add(normPath(t.sessionPath));
  }
  return out;
}

async function archivePaths(paths: string[], archived: boolean): Promise<string[]> {
  const ok: string[] = [];
  const want = new Set(paths);
  useSessionStore.setState((s) => ({ allSessions: s.allSessions.map((x) => (want.has(x.path) ? { ...x, archived } : x)) }));
  for (const p of paths) {
    try {
      if (archived) await stopSessionTabs(p);
      await window.studio.updateSessionMeta(p, { archived });
      ok.push(p);
    } catch {
      /* reported by caller via the diff */
    }
  }
  await useSessionStore.getState().refreshCatalog();
  return ok;
}

export async function undoTidy(): Promise<void> {
  const paths = get().items.filter((i) => i.status === "archived").map((i) => i.path);
  if (!paths.length) return;
  const ok = new Set(await archivePaths(paths, false));
  patchItems(ok, { status: "keep", source: undefined });
  log(`Restored ${ok.size} session${ok.size === 1 ? "" : "s"}`, "ok");
  toast({ kind: "success", message: `Restored ${ok.size} archived session${ok.size === 1 ? "" : "s"}` });
}

async function tidyWorktrees(projectPath: string, projectId: string): Promise<number> {
  const all = useSessionStore.getState().allSessions.filter((s) => s.projectId === projectId && s.worktree);
  const live = all.filter((s) => !s.archived);
  const tabWts = useSessionStore.getState().tabs.flatMap((t) => (t.worktree ? [t.worktree] : []));
  const candidates = await window.studio.worktreeTidyScan({
    projectPath,
    liveBranches: [...live.map((s) => s.worktree!.branch), ...tabWts.map((w) => w.branch)],
    livePaths: [...live.map((s) => s.worktree!.worktreePath), ...tabWts.map((w) => w.worktreePath)],
    archivedBranches: all.filter((s) => s.archived).map((s) => s.worktree!.branch),
  });
  if (!candidates.length) {
    log("No unused worktrees or branches");
    return 0;
  }
  log(`${candidates.length} unused worktree/branch${candidates.length === 1 ? "" : "es"} found. Pick what to delete.`);
  const choices = await askWorktrees(candidates);
  if (!choices) {
    log("Worktree cleanup skipped", "warn");
    return 0;
  }
  const actions = candidates.flatMap((c) => {
    const choice = choices[c.branch];
    if (!choice || choice === "keep") return [];
    return [
      {
        branch: c.branch,
        worktreePath: c.worktreePath,
        deleteLocal: choice !== "all" || c.hasLocalBranch || !!c.worktreePath,
        deleteRemote: choice === "all",
      },
    ];
  });
  if (!actions.length) return 0;
  for (const a of actions) {
    const owner = all.find((s) => s.worktree?.branch === a.branch);
    if (owner && a.deleteLocal) await stopSessionTabs(owner.path);
  }
  const results = await window.studio.worktreeTidyApply(projectPath, actions);
  const failed = results.filter((r) => !r.ok);
  for (const f of failed) {
    log(`Couldn't clean ${f.branch}: ${f.error ?? "failed"}`, "warn");
    toast({ kind: "error", message: `Couldn't clean ${f.branch}: ${f.error ?? "failed"}` });
  }
  return results.length - failed.length;
}

/** Open the Tidy tab and run the whole pipeline. */
export async function startTidy(model: { id: string; label: string }): Promise<void> {
  const ss = useSessionStore.getState();
  const project = ss.activeProject;
  if (!project || isTidyBusy()) {
    openTidyTab();
    return;
  }
  const { options } = get();
  set({
    phase: "scanning",
    items: [],
    log: [],
    batchesTotal: 0,
    batchesDone: 0,
    modelLabel: model.label,
    startedAt: Date.now(),
    finishedAt: 0,
    worktreePrompt: null,
    worktreesRemoved: 0,
    cancelRequested: false,
  });
  openTidyTab();
  const cancelled = () => get().cancelRequested;

  try {
    log(`Scanning sessions in ${project.name ?? project.path}…`);
    const openTabs = new Set(ss.tabs.filter((t) => t.sessionPath).map((t) => normPath(t.sessionPath!)));
    const guarded = protectedPaths();
    const now = Date.now();
    const pool = ss.allSessions.filter((s: SessionCatalogItem) => s.projectId === project.id && !s.archived);
    const eligible = pool.filter((s) => {
      if (s.pending || isSubagentSession(s)) return false;
      const n = normPath(s.path);
      if (guarded.has(n)) return false;
      if (openTabs.has(n) && !options.includeOpen) return false;
      if (s.worktree && !options.includeWorktrees) return false;
      return now - new Date(s.modified).getTime() >= FRESH_MS;
    });
    // Oldest first.
    eligible.sort((a, b) => new Date(a.modified).getTime() - new Date(b.modified).getTime());
    const items: TidyItem[] = eligible.map((s) => ({
      path: s.path,
      title: sessionDisplayTitle(s) || "Untitled",
      modified: s.modified,
      messageCount: s.messageCount,
      status: "queued",
      hadTab: openTabs.has(normPath(s.path)),
      hasWorktree: !!s.worktree,
    }));
    set({ items });
    log(`${pool.length} active sessions · ${items.length} eligible · ${pool.length - items.length} protected (running, fresh, or in use)`);

    // Stage 1: fixed rule. Anything long untouched needs no model.
    if (options.autoDays > 0) {
      const cutoff = now - options.autoDays * DAY_MS;
      const ruled = new Set(items.filter((i) => new Date(i.modified).getTime() < cutoff).map((i) => i.path));
      if (ruled.size) {
        patchItems(ruled, { status: "archive", source: "rule" });
        log(`${ruled.size} untouched for ${options.autoDays}+ days: marked without asking the model`, "ok");
      }
    }

    // Stage 2: model, in batches.
    const rest = get().items.filter((i) => i.status === "queued");
    const batches: TidyItem[][] = [];
    for (let i = 0; i < rest.length; i += BATCH_SIZE) batches.push(rest.slice(i, i + BATCH_SIZE));
    if (batches.length && !cancelled()) {
      set({ phase: "asking", batchesTotal: batches.length, batchesDone: 0 });
      log(`Asking ${model.label} about ${rest.length} sessions in ${batches.length} batch${batches.length === 1 ? "" : "es"}…`);
      let next = 0;
      const worker = async () => {
        while (!cancelled()) {
          const idx = next++;
          const batch = batches[idx];
          if (!batch) return;
          const paths = new Set(batch.map((b) => b.path));
          patchItems(paths, { status: "asking" });
          let picked: string[] | null = null;
          try {
            picked = await window.studio.pickStaleSessions(
              project.path,
              batch.map((b) => ({ path: b.path, title: b.title, modified: b.modified, messageCount: b.messageCount })),
              model.id,
            );
          } catch {
            picked = null;
          }
          if (!picked) {
            patchItems(paths, { status: "failed" });
            log(`Batch ${idx + 1}/${batches.length}: model call failed`, "warn");
          } else {
            const yes = new Set(picked);
            patchItems(new Set(batch.filter((b) => yes.has(b.path)).map((b) => b.path)), { status: "archive", source: "model" });
            patchItems(new Set(batch.filter((b) => !yes.has(b.path)).map((b) => b.path)), { status: "keep" });
            log(`Batch ${idx + 1}/${batches.length}: archive ${yes.size}, keep ${batch.length - yes.size}`, "ok");
          }
          set((s) => ({ batchesDone: s.batchesDone + 1 }));
        }
      };
      await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, worker));
    }
    // Cancelled mid-way: unfinished items go back to plain keep.
    patchItems(new Set(get().items.filter((i) => i.status === "queued" || i.status === "asking").map((i) => i.path)), { status: "keep" });

    // Stage 3: archive.
    if (cancelled()) {
      patchItems(new Set(get().items.filter((i) => i.status === "archive").map((i) => i.path)), { status: "keep", source: undefined });
    } else {
      // Models take a while: re-check what became busy meanwhile.
      const nowGuarded = protectedPaths();
      const lastViewed = new Set(useSessionStore.getState().tabs.filter((t) => t.sessionPath && t.id === useSessionStore.getState().activeTabId).map((t) => normPath(t.sessionPath!)));
      const skip = get().items.filter((i) => i.status === "archive" && (nowGuarded.has(normPath(i.path)) || lastViewed.has(normPath(i.path))));
      if (skip.length) {
        patchItems(new Set(skip.map((i) => i.path)), { status: "keep", source: undefined });
        log(`Kept ${skip.length} session${skip.length === 1 ? "" : "s"} that became active`, "warn");
      }
    }
    const toArchive = get().items.filter((i) => i.status === "archive");
    if (toArchive.length && !cancelled()) {
      set({ phase: "archiving" });
      log(`Archiving ${toArchive.length} sessions…`);
      const ok = new Set(await archivePaths(toArchive.map((i) => i.path), true));
      patchItems(ok, { status: "archived" });
      patchItems(new Set(toArchive.filter((i) => !ok.has(i.path)).map((i) => i.path)), { status: "failed" });
      log(`Archived ${ok.size}`, "ok");
    } else if (!toArchive.length) {
      log("Nothing to archive");
    }

    // Stage 4: worktrees.
    if (!cancelled()) {
      set({ phase: "worktrees" });
      log("Looking for unused worktrees…");
      try {
        const removed = await tidyWorktrees(project.path, project.id);
        set({ worktreesRemoved: removed });
        if (removed) log(`Cleaned ${removed} worktree/branch${removed === 1 ? "" : "es"}`, "ok");
      } catch {
        log("Worktree cleanup failed", "warn");
      }
    }

    set({ phase: cancelled() ? "cancelled" : "done", finishedAt: Date.now() });
    log(cancelled() ? "Stopped" : "Done", cancelled() ? "warn" : "ok");
  } catch (err) {
    log(`Failed: ${err instanceof Error ? err.message : String(err)}`, "warn");
    set({ phase: "error", finishedAt: Date.now(), worktreePrompt: null });
  }
}
