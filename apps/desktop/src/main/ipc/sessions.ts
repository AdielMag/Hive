import {
  BRIDGE_TOPICS,
  IPC,
  type BridgeActionRequest,
  type LinkedProject,
  type RpcExtensionUIResponse,
  type SessionMetaEntry,
  type SessionWorktree,
  type StartSessionRequest,
  type StudioRpcCommand,
  type WorktreeRemoveOptions,
} from "@hive/protocol";
import { existsSync } from "node:fs";
import type { AppContext } from "../context.ts";
import { generateSessionTitle } from "../services/session-title.ts";
import { isManagedWorktree, mergeWorktree, removeWorktree, renameWorktreeBranch, worktreeStatus } from "../services/worktrees.ts";
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
  handle(IPC.projectsAdd, ({ path, name, color }: { path: string; name?: string; color?: string }) =>
    ctx.guiStore.addProject(path, name, color),
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

  // Session worktrees
  handle(IPC.worktreeStatus, ({ worktree }: { worktree: SessionWorktree }) =>
    worktreeStatus(requireWorktree(worktree)),
  );
  handle(IPC.worktreeRemove, ({ worktree, options }: { worktree: SessionWorktree; options?: WorktreeRemoveOptions }) =>
    removeWorktree(requireWorktree(worktree), { force: options?.force === true, deleteBranch: options?.deleteBranch !== false }),
  );
  handle(IPC.worktreeMerge, ({ worktree }: { worktree: SessionWorktree }) => mergeWorktree(requireWorktree(worktree)));
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

function requireWorktree(value: unknown): SessionWorktree {
  const wt = sanitizeWorktree(value);
  if (!wt) throw new Error("Invalid session worktree");
  return wt;
}
