import {
  BRIDGE_TOPICS,
  IPC,
  type BridgeActionRequest,
  type LinkedProject,
  type MergeConflictAiRequest,
  type MergeConflictResolution,
  type RpcExtensionUIResponse,
  type SessionMetaEntry,
  type SessionWorktree,
  type StartSessionRequest,
  type StudioRpcCommand,
  type WorktreeRemoveOptions,
  type TidyWorktreeAction,
  type TidyWorktreeScanRequest,
} from "@hive/protocol";
import { existsSync } from "node:fs";
import type { AppContext } from "../context.ts";
import { abortConflicts, aiResolveHunk, resolveConflicts, startConflictMerge } from "../services/merge-conflicts.ts";
import { generateSessionTitle } from "../services/session-title.ts";
import { pickStaleSessions } from "../services/stale-sessions.ts";
import {
  applyTidyWorktrees,
  isManagedWorktree,
  mergeWorktree,
  removeWorktree,
  renameWorktreeBranch,
  scanTidyWorktrees,
  worktreeStatus,
} from "../services/worktrees.ts";
import { handle } from "./util.ts";

const NO_PI = { ok: false as const, error: "Pi CLI not available" };

export function registerSessionIpc(ctx: AppContext): void {
  handle(IPC.startSession, (req: StartSessionRequest) => {
    if (!ctx.sessions) throw new Error(NO_PI.error);
    return ctx.sessions.startSession(req);
  });
  handle(IPC.stopSession, (key: string) => ctx.sessions?.stopSession(key));
  handle(IPC.rpc, (key: string, cmd: StudioRpcCommand) => ctx.sessions?.executeRpc(key, cmd) ?? NO_PI);
  handle(IPC.uiResponse, (key: string, res: RpcExtensionUIResponse) => ctx.sessions?.respondUi(key, res));
  handle(IPC.bridgeAction, (key: string, action: BridgeActionRequest) => ctx.sessions?.executeBridgeAction(key, action) ?? NO_PI);
  // The renderer may only publish on the GUI->extension topic, not arbitrary bus channels.
  handle(IPC.bridgeEmit, (key: string, topic: string, data: unknown) =>
    topic === BRIDGE_TOPICS.fromGui ? ctx.sessions?.emitToBridge(key, topic, data) : undefined,
  );
  handle(IPC.setLinkedProjects, (key: string, links: LinkedProject[]) => ctx.sessions?.setLinkedProjects(key, links));

  // Projects & catalog
  handle(IPC.projectsList, () => ctx.guiStore.getProjects());
  handle(IPC.projectsAdd, ({ path, name, color, icon }: { path: string; name?: string; color?: string; icon?: string | null }) =>
    ctx.guiStore.addProject(path, name, color, icon),
  );
  handle(IPC.projectsUpdate, ({ id, updates }: { id: string; updates: Parameters<AppContext["guiStore"]["updateProject"]>[1] }) => {
    const updated = ctx.guiStore.updateProject(id, updates);
    if (updates.links) void ctx.sessions?.refreshProjectLinks(updated.path, updated.links);
    return updated;
  });
  handle(IPC.projectsRemove, ({ id }: { id: string }) => ctx.guiStore.removeProject(id));
  handle(IPC.projectsGetLastOpened, () => ctx.guiStore.getLastOpenedProjectId());
  handle(IPC.projectsSetLastOpened, ({ id }: { id?: string }) => ctx.guiStore.setLastOpenedProjectId(id));
  handle(IPC.sessionsListAll, () => ctx.catalog?.listAll() ?? []);
  handle(IPC.sessionsReadFile, ({ path }: { path: string }) => {
    if (!ctx.catalog) throw new Error("Catalog service not available");
    return ctx.catalog.readSessionFile(path);
  });
  handle(IPC.sessionsDelete, ({ path }: { path: string }) => ctx.catalog?.deleteSession(path) ?? false);
  handle(IPC.sessionsUpdateMeta, ({ path, updates }: { path: string; updates: Partial<SessionMetaEntry> }) =>
    ctx.guiStore.updateSessionMeta(path, sanitizeSessionMeta(updates)),
  );
  handle(
    IPC.sessionsGenerateTitle,
    async ({ cwd, prompt, model, sessionPath }: { cwd: string; prompt: string; model?: string; sessionPath?: string }) => {
      if (!ctx.pi.ok) return "";
      // Prefer the session's effective cwd (its worktree) over the project path the renderer passes.
      const wt = sessionPath ? ctx.guiStore.getSessionMeta(sessionPath).worktree : undefined;
      const effective = wt && existsSync(wt.worktreePath) ? wt.worktreePath : cwd;
      return generateSessionTitle(ctx.pi.info, effective, prompt, model);
    },
  );

  handle(
    IPC.sessionsPickStale,
    async ({ cwd, sessions, model }: { cwd: string; sessions: unknown; model?: string }) => {
      if (!ctx.pi.ok || !Array.isArray(sessions)) return null;
      return pickStaleSessions(ctx.pi.info, cwd, sessions, model);
    },
  );

  // Session worktrees
  handle(IPC.worktreeStatus, ({ worktree }: { worktree: SessionWorktree }) =>
    worktreeStatus(requireWorktree(worktree)),
  );
  handle(IPC.worktreeRemove, ({ worktree, options }: { worktree: SessionWorktree; options?: WorktreeRemoveOptions }) =>
    removeWorktree(requireWorktree(worktree), { force: options?.force === true, deleteBranch: options?.deleteBranch !== false }),
  );
  handle(IPC.worktreeTidyScan, ({ request }: { request: TidyWorktreeScanRequest }) => {
    requireKnownProject(ctx, request?.projectPath);
    return scanTidyWorktrees({
      projectPath: request.projectPath,
      liveBranches: strList(request.liveBranches),
      livePaths: strList(request.livePaths),
      archivedBranches: strList(request.archivedBranches),
    });
  });
  handle(IPC.worktreeTidyApply, ({ projectPath, actions }: { projectPath: string; actions: TidyWorktreeAction[] }) => {
    requireKnownProject(ctx, projectPath);
    return applyTidyWorktrees(projectPath, Array.isArray(actions) ? actions : []);
  });
  handle(IPC.worktreeMerge, ({ worktree }: { worktree: SessionWorktree }) => mergeWorktree(requireWorktree(worktree)));
  handle(IPC.worktreeConflictsStart, ({ worktree }: { worktree: SessionWorktree }) =>
    startConflictMerge(requireWorktree(worktree)),
  );
  handle(
    IPC.worktreeConflictsResolve,
    ({ worktree, resolutions }: { worktree: SessionWorktree; resolutions: MergeConflictResolution[] }) =>
      resolveConflicts(requireWorktree(worktree), Array.isArray(resolutions) ? resolutions : []),
  );
  handle(IPC.worktreeConflictsAbort, ({ worktree }: { worktree: SessionWorktree }) =>
    abortConflicts(requireWorktree(worktree)),
  );
  handle(
    IPC.worktreeConflictsAi,
    async ({ worktree, request }: { worktree: SessionWorktree; request: MergeConflictAiRequest }) => {
      const wt = requireWorktree(worktree);
      if (!ctx.pi.ok) return { ok: false as const, error: NO_PI.error };
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      const cwd = existsSync(wt.worktreePath) ? wt.worktreePath : wt.projectPath;
      return aiResolveHunk(ctx.pi.info, cwd, {
        path: str(request?.path).slice(0, 500),
        before: str(request?.before),
        after: str(request?.after),
        ours: str(request?.ours),
        theirs: str(request?.theirs),
        oursLabel: str(request?.oursLabel).slice(0, 200) || undefined,
        theirsLabel: str(request?.theirsLabel).slice(0, 200) || undefined,
        hint: str(request?.hint).slice(0, 500) || undefined,
        model: str(request?.model).slice(0, 200) || undefined,
      });
    },
  );
  handle(IPC.worktreeRenameBranch, ({ worktree, newTitle }: { worktree: SessionWorktree; newTitle: string }) =>
    renameWorktreeBranch(requireWorktree(worktree), newTitle),
  );
  handle(IPC.trustCheck, ({ path }: { path: string }) => ctx.catalog?.checkTrust(path) ?? { hasTrustResources: false, trusted: true });
  handle(IPC.trustSet, async ({ path, trusted }: { path: string; trusted: boolean }) => {
    await ctx.catalog?.setTrust(path, trusted);
  });
}

/** Only accept the known, renderer-editable meta fields. */
function sanitizeSessionMeta(updates: Partial<SessionMetaEntry>): Partial<SessionMetaEntry> {
  const out: Partial<SessionMetaEntry> = {};
  if (updates && typeof updates === "object") {
    if ("title" in updates) out.title = typeof updates.title === "string" && updates.title.trim() ? updates.title.trim().slice(0, 200) : undefined;
    if ("aiTitle" in updates) out.aiTitle = typeof updates.aiTitle === "string" && updates.aiTitle.trim() ? updates.aiTitle.trim().slice(0, 200) : undefined;
    if (typeof updates.archived === "boolean") out.archived = updates.archived;
    if (typeof updates.pinned === "boolean") out.pinned = updates.pinned;
    if ("worktree" in updates) out.worktree = sanitizeWorktree(updates.worktree);
  }
  return out;
}

/** Keep only a well-formed worktree (all string fields, inside <project>/.hive-worktrees); anything else clears it. */
function sanitizeWorktree(value: unknown): SessionWorktree | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const keys = ["worktreePath", "branch", "baseBranch", "baseCommit", "projectPath"] as const;
  if (!keys.every((k) => typeof v[k] === "string" && (v[k] as string).length > 0 && (v[k] as string).length < 1024)) return undefined;
  const wt: SessionWorktree = {
    worktreePath: v.worktreePath as string,
    branch: v.branch as string,
    baseBranch: v.baseBranch as string,
    baseCommit: v.baseCommit as string,
    projectPath: v.projectPath as string,
  };
  return isManagedWorktree(wt) ? wt : undefined;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function requireKnownProject(ctx: AppContext, projectPath: unknown): asserts projectPath is string {
  const trim = (s: string) => s.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
  const p = typeof projectPath === "string" ? trim(projectPath) : "";
  if (!p || !ctx.guiStore.getProjects().some((x) => trim(x.path) === p)) throw new Error("Unknown project");
}

function requireWorktree(value: unknown): SessionWorktree {
  const wt = sanitizeWorktree(value);
  if (!wt) throw new Error("Invalid session worktree");
  return wt;
}
