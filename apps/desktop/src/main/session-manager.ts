import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type BrowserWindow } from "electron";
import { PiRpcConnection } from "@pi-studio/pi-adapter/node";
import {
  IPC,
  type BridgeActionRequest,
  type BridgeActionResult,
  type LinkedProject,
  type PiInstallInfo,
  type PiStreamEvent,
  type RpcExtensionUIRequest,
  type RpcExtensionUIResponse,
  type RpcResult,
  type SessionEventBatch,
  type SessionStatusUpdate,
  type StartSessionRequest,
  type StartSessionResult,
  type StudioRpcCommand,
} from "@pi-studio/protocol";
import { createBridgeServer, type BridgeSessionHandle } from "./bridge-server/index.ts";

interface ActiveSession {
  key: string;
  projectPath: string;
  sessionPath?: string;
  rpc: PiRpcConnection;
  bridge: BridgeSessionHandle;
  eventBuffer: PiStreamEvent[];
  flushTimer: ReturnType<typeof setTimeout> | null;
}

export class MainSessionManager {
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly bridgeExtensionPath: string;
  private nextSessionId = 0;

  constructor(
    private readonly piInfo: PiInstallInfo,
    private readonly getWindow: () => BrowserWindow | null,
    private readonly testProviderPath?: string,
  ) {
    const __dirname = fileURLToPath(new URL(".", import.meta.url));
    // When running in dev or built, resources/bridge/studio-bridge.ts is in resources
    this.bridgeExtensionPath = resolve(__dirname, "../../resources/bridge/studio-bridge.ts");
  }

  async startSession(request: StartSessionRequest): Promise<StartSessionResult> {
    const key = `sess_${++this.nextSessionId}`;
    const bridge = await createBridgeServer();

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
      cwd: request.projectPath,
      args,
      env: {
        ...process.env,
        ...bridge.env,
      },
    });

    const session: ActiveSession = {
      key,
      projectPath: request.projectPath,
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
      return { key, projectPath: request.projectPath };
    } catch (err) {
      void bridge.close();
      this.sessions.delete(key);
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
      const data = await session.bridge.executeAction(actionName, params, session.rpc);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async setLinkedProjects(key: string, links: LinkedProject[]): Promise<void> {
    const session = this.sessions.get(key);
    if (!session) return;
    await session.bridge.setLinkedProjects(links);
  }

  async stopAll(): Promise<void> {
    const keys = [...this.sessions.keys()];
    await Promise.allSettled(keys.map((k) => this.stopSession(k)));
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
