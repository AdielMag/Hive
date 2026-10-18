import { existsSync } from "node:fs";
import { type BrowserWindow } from "electron";
import { PiRpcConnection } from "@hive/pi-adapter/node";
import {
  BRIDGE_PROTOCOL_VERSION,
  IPC,
  type BridgeActionRequest,
  type BridgeActionResult,
  type LinkedProject,
  type PiInstallInfo,
  type PiStreamEvent,
  type RpcExtensionUIRequest,
  type RpcExtensionUIResponse,
  type RpcResult,
  type SessionMetaEntry,
  type SessionEventBatch,
  type SessionStatusUpdate,
  type SessionStartProgress,
  type SessionWorktree,
  type StartSessionRequest,
  type StartSessionResult,
  type StudioRpcCommand,
} from "@hive/protocol";
import { bridgeExtensionPath } from "../paths.ts";
import { createBridgeServer, type BridgeSessionHandle } from "../bridge-server/index.ts";
import type { SessionRegistry } from "@hive/protocol";
import type { CheckpointService } from "./checkpoints/service.ts";
import { createWorktree, removeWorktree } from "./worktrees.ts";

/** The slice of GuiStore the manager needs (session meta persistence for worktrees). */
export interface SessionMetaStore {
  getSessionMeta(sessionPath: string): SessionMetaEntry;
  updateSessionMeta(sessionPath: string, updates: Partial<SessionMetaEntry>): SessionMetaEntry;
  getProjectByPath?(dirPath: string): { links?: LinkedProject[] } | undefined;
}

interface ActiveSession {
  key: string;
  /** The project (main tree) the session belongs to. */
  projectPath: string;
  /** Effective cwd Pi runs in: the worktree when present, else `projectPath`. */
  cwd: string;
  worktree?: SessionWorktree;
  sessionPath?: string;
  rpc: PiRpcConnection;
  bridge: BridgeSessionHandle;
  eventBuffer: PiStreamEvent[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  registry?: SessionRegistry;
}

export class MainSessionManager {
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly bridgeExtensionPath: string;
  private nextSessionId = 0;

  constructor(
    private readonly piInfo: PiInstallInfo,
    private readonly getWindow: () => BrowserWindow | null,
    private readonly testProviderPath?: string,
    private readonly checkpoints?: CheckpointService,
    private readonly store?: SessionMetaStore,
  ) {
    this.bridgeExtensionPath = bridgeExtensionPath();
  }

  async startSession(request: StartSessionRequest): Promise<StartSessionResult> {
    const key = `sess_${++this.nextSessionId}`;
    const progress = (step: SessionStartProgress["step"]): void => {
      if (request.startId) this.sendToWindow(IPC.evtStartProgress, { startId: request.startId, step } satisfies SessionStartProgress);
    };

    // Resume: reuse the worktree recorded for the session (if its folder still exists).
    // New session: create one unless the caller opted out. Failures fall back to the main tree.
    let worktree: SessionWorktree | undefined;
    let createdWorktree = false;
    if (request.sessionPath) {
      const recorded = this.store?.getSessionMeta(request.sessionPath).worktree;
      if (recorded && existsSync(recorded.worktreePath)) worktree = recorded;
      else if (recorded && request.useWorktree !== false) {
        // The worktree was deleted (e.g. merged and cleaned up, or removed by hand). Don't fall back to the main
        // tree: give the session a fresh worktree forked from the same base.
        const title = recorded.branch.replace(/^hive\//, "").replace(/-[0-9a-f]{6}$/, "").replace(/-/g, " ");
        const base = recorded.baseBranch === "HEAD" ? undefined : recorded.baseBranch;
        progress("worktree");
        worktree =
          (await createWorktree({ projectPath: recorded.projectPath || request.projectPath, title: request.title ?? title, baseBranch: base })) ??
          (base ? ((await createWorktree({ projectPath: recorded.projectPath || request.projectPath, title: request.title ?? title })) ?? undefined) : undefined);
        createdWorktree = !!worktree;
      }
    } else if (request.useWorktree !== false) {
      progress("worktree");
      worktree =
        (await createWorktree({ projectPath: request.projectPath, title: request.title, baseBranch: request.baseBranch })) ?? undefined;
      createdWorktree = !!worktree;
    }
    const cwd = worktree?.worktreePath ?? request.projectPath;
    progress("spawn");

    let bridge: Awaited<ReturnType<typeof createBridgeServer>>;
    try {
      bridge = await createBridgeServer();
    } catch (err) {
      if (createdWorktree && worktree) void removeWorktree(worktree, { force: true });
      throw err;
    }

    const args: string[] = ["-e", this.bridgeExtensionPath];
    if (this.testProviderPath) {
      args.push("-e", this.testProviderPath);
    }
    if (request.sessionPath) {
      args.push("--session", request.sessionPath);
    }

    const rpc = new PiRpcConnection({
      nodePath: this.piInfo.nodePath,
      cliPath: this.piInfo.cliPath,
      cwd,
      args,
      env: {
        ...process.env,
        ...bridge.env,
      },
    });

    const session: ActiveSession = {
      key,
      projectPath: request.projectPath,
      cwd,
      worktree,
      sessionPath: request.sessionPath,
      rpc,
      bridge,
      eventBuffer: [],
      flushTimer: null,
    };
    this.sessions.set(key, session);

    // Forward status updates
    this.sendStatus(key, "starting");

    rpc.onEvent((event) => {
      session.eventBuffer.push(event);
      if (!session.flushTimer) {
        session.flushTimer = setTimeout(() => this.flushEvents(session), 50);
      }
    });

    rpc.onUiRequest((req: RpcExtensionUIRequest) => {
      this.sendToWindow(IPC.evtUiRequest, { key, request: req });
    });

    bridge.onMessage((msg) => {
      if (msg.type === "hello") {
        // Deliver the project's linked folders so the agent sees the extended workspace.
        const links = this.store?.getProjectByPath?.(session.projectPath)?.links ?? [];
        if (links.length > 0) void bridge.setLinkedProjects(links).catch(() => {});
      } else if (msg.type === "registry") {
        session.registry = {
          sessionId: msg.sessionId,
          cwd: msg.cwd,
          homeDir: msg.homeDir,
          tools: msg.tools,
          skills: msg.skills,
          receivedAt: Date.now(),
        };
      } else if (msg.type === "checkpoint_request") {
        if (this.checkpoints) {
          void this.checkpoints.onPromptSent(session.cwd, msg.sessionId, msg.userTs).then(() => {
            void bridge.send({ v: BRIDGE_PROTOCOL_VERSION, type: "checkpoint_done", reqId: msg.reqId });
          }).catch((err) => {
            console.error("[checkpoints] failed to capture before-snapshot", err);
            void bridge.send({ v: BRIDGE_PROTOCOL_VERSION, type: "checkpoint_done", reqId: msg.reqId });
          });
        } else {
          void bridge.send({ v: BRIDGE_PROTOCOL_VERSION, type: "checkpoint_done", reqId: msg.reqId });
        }
      } else if (msg.type === "checkpoint_bind") {
        if (this.checkpoints) {
          void this.checkpoints.bindEntryId(session.cwd, msg.sessionId, msg.userTs, msg.leafEntryId);
        }
      } else if (msg.type === "boundary") {
        if (msg.phase === "agent_settled" && msg.userTs && this.checkpoints) {
          void this.checkpoints.onTurnSettled(session.cwd, session.key, msg.userTs);
        }
      }
      this.sendToWindow(IPC.evtBridge, { key, message: msg });
    });

    rpc.onExit((exit) => {
      this.flushEvents(session);
      this.sendStatus(key, exit.code === 0 ? "exited" : "crashed", {
        exitCode: exit.code,
        error: exit.error,
        stderrTail: rpc.stderr.trim().split("\n").slice(-8).join("\n"),
      });
      void bridge.close();
      this.sessions.delete(key);
    });

    try {
      await rpc.start();
      this.sendStatus(key, "ready", { pid: rpc.pid });
      if (createdWorktree && worktree) void this.persistWorktreeMeta(session, worktree);
      return { key, projectPath: request.projectPath, ...(worktree ? { worktree } : {}) };
    } catch (err) {
      void bridge.close();
      this.sessions.delete(key);
      if (createdWorktree && worktree) void removeWorktree(worktree, { force: true });
      const msg = err instanceof Error ? err.message : String(err);
      this.sendStatus(key, "crashed", { error: msg });
      throw err;
    }
  }

  async stopSession(key: string): Promise<void> {
    const session = this.sessions.get(key);
    if (!session) return;
    this.sendStatus(key, "stopping");
    this.flushEvents(session);
    await session.rpc.stop();
    await session.bridge.close();
    this.sessions.delete(key);
  }

  async executeRpc(key: string, command: StudioRpcCommand): Promise<RpcResult> {
    const session = this.sessions.get(key);
    if (!session) {
      return { ok: false, error: `Session "${key}" is not active` };
    }
    try {
      const response = await session.rpc.send(command);
      if (response.success) {
        return { ok: true, data: (response as { data?: unknown }).data };
      }
      return { ok: false, error: response.error };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  getRegistry(key: string): SessionRegistry | null {
    const session = this.sessions.get(key);
    return session?.registry ?? null;
  }

  getProjectPath(key: string): string | null {
    const session = this.sessions.get(key);
    return session?.projectPath ?? null;
  }

  async getPiSessionId(key: string): Promise<string | null> {
    const session = this.sessions.get(key);
    if (!session) return null;
    if (session.registry?.sessionId) return session.registry.sessionId;
    try {
      const res = await session.rpc.send({ type: "get_state" });
      const anyRes = res as Record<string, unknown>;
      const resData = anyRes?.data as Record<string, unknown> | undefined;
      if (res.success && resData && typeof resData.sessionId === "string") {
        return resData.sessionId;
      }
    } catch {
      // ignore
    }
    return null;
  }

  async respondUi(key: string, response: RpcExtensionUIResponse): Promise<void> {
    const session = this.sessions.get(key);
    if (!session) return;
    await session.rpc.respondUi(response);
  }

  async executeBridgeAction(key: string, action: BridgeActionRequest): Promise<BridgeActionResult> {
    const session = this.sessions.get(key);
    if (!session) {
      return { ok: false, error: `Session "${key}" is not active` };
    }
    try {
      const { action: actionName, ...params } = action;
      // Reload re-imports every extension, which can take a while (MCP servers, big skill sets).
      const timeoutMs = actionName === "reload" ? 30_000 : undefined;
      const data = await session.bridge.executeAction(actionName, params, session.rpc, timeoutMs);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Publish on the session's `pi.events` bus via the bridge (no-op if the session or bridge is gone). */
  async emitToBridge(key: string, topic: string, data: unknown): Promise<void> {
    const session = this.sessions.get(key);
    if (!session) return;
    await session.bridge.send({ v: BRIDGE_PROTOCOL_VERSION, type: "emit", topic, data });
  }

  async setLinkedProjects(key: string, links: LinkedProject[]): Promise<void> {
    const session = this.sessions.get(key);
    if (!session) return;
    await session.bridge.setLinkedProjects(links);
  }

  /** Pushes a project's current links to all of its live sessions. */
  async refreshProjectLinks(projectPath: string, links: LinkedProject[]): Promise<void> {
    const targets = [...this.sessions.values()].filter((s) => s.projectPath === projectPath);
    await Promise.allSettled(targets.map((s) => s.bridge.setLinkedProjects(links)));
  }

  async stopAll(): Promise<void> {
    const keys = [...this.sessions.keys()];
    await Promise.allSettled(keys.map((k) => this.stopSession(k)));
  }

  getSession(key: string): { key: string; projectPath: string; cwd: string; worktree?: SessionWorktree } | undefined {
    const s = this.sessions.get(key);
    return s ? { key: s.key, projectPath: s.projectPath, cwd: s.cwd, worktree: s.worktree } : undefined;
  }

  getAllSessions(): { key: string; projectPath: string; cwd: string; worktree?: SessionWorktree }[] {
    return Array.from(this.sessions.values()).map((s) => ({ key: s.key, projectPath: s.projectPath, cwd: s.cwd, worktree: s.worktree }));
  }

  /** Effective cwd (worktree when present) of a live session. */
  getCwd(key: string): string | null {
    return this.sessions.get(key)?.cwd ?? null;
  }

  /**
   * Meta is keyed by the session file, which Pi only reports once running: read it from get_state
   * and record the worktree. Best effort; the renderer can also persist it via updateSessionMeta.
   */
  private async persistWorktreeMeta(session: ActiveSession, worktree: SessionWorktree): Promise<void> {
    if (!this.store) return;
    try {
      const res = await session.rpc.send({ type: "get_state" });
      const data = (res as { data?: Record<string, unknown> }).data;
      const file = res.success && data && typeof data.sessionFile === "string" ? data.sessionFile : undefined;
      if (!file) return;
      session.sessionPath = file;
      this.store.updateSessionMeta(file, { worktree });
    } catch (err) {
      console.warn("[worktrees] could not persist worktree meta", err instanceof Error ? err.message : err);
    }
  }

  private flushEvents(session: ActiveSession): void {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    if (session.eventBuffer.length === 0) return;
    const batch: SessionEventBatch = {
      key: session.key,
      events: session.eventBuffer.splice(0),
    };
    this.sendToWindow(IPC.evtEvents, batch);
  }

  private sendStatus(
    key: string,
    phase: SessionStatusUpdate["phase"],
    extra?: Partial<SessionStatusUpdate>,
  ): void {
    const update: SessionStatusUpdate = {
      key,
      phase,
      ...extra,
    };
    this.sendToWindow(IPC.evtStatus, update);
  }

  private sendToWindow(channel: string, payload: unknown): void {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(channel, payload);
  }
}
