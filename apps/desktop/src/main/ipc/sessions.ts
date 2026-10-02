import {
  IPC,
  type BridgeActionRequest,
  type LinkedProject,
  type RpcExtensionUIResponse,
  type SessionMetaEntry,
  type StartSessionRequest,
  type StudioRpcCommand,
} from "@hive/protocol";
import type { AppContext } from "../context.ts";
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
  handle(IPC.setLinkedProjects, (key: string, links: LinkedProject[]) => ctx.sessions?.setLinkedProjects(key, links));

  // Projects & catalog
  handle(IPC.projectsList, () => ctx.guiStore.getProjects());
  handle(IPC.projectsAdd, ({ path, name, color }: { path: string; name?: string; color?: string }) =>
    ctx.guiStore.addProject(path, name, color),
  );
  handle(IPC.projectsUpdate, ({ id, updates }: { id: string; updates: Parameters<AppContext["guiStore"]["updateProject"]>[1] }) =>
    ctx.guiStore.updateProject(id, updates),
  );
  handle(IPC.projectsRemove, ({ id }: { id: string }) => ctx.guiStore.removeProject(id));
  handle(IPC.sessionsListAll, () => ctx.catalog?.listAll() ?? []);
  handle(IPC.sessionsReadFile, ({ path }: { path: string }) => {
    if (!ctx.catalog) throw new Error("Catalog service not available");
    return ctx.catalog.readSessionFile(path);
  });
  handle(IPC.sessionsDelete, ({ path }: { path: string }) => ctx.catalog?.deleteSession(path) ?? false);
  handle(IPC.sessionsUpdateMeta, ({ path, updates }: { path: string; updates: Partial<SessionMetaEntry> }) =>
    ctx.guiStore.updateSessionMeta(path, sanitizeSessionMeta(updates)),
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
    if (typeof updates.archived === "boolean") out.archived = updates.archived;
    if (typeof updates.pinned === "boolean") out.pinned = updates.pinned;
  }
  return out;
}
