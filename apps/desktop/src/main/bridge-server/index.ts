import { createServer, type Server, type Socket } from "node:net";
import { randomBytes } from "node:crypto";
import { JsonlSplitter, serializeRecord } from "@hive/pi-adapter";
import {
  BRIDGE_COMMAND,
  BRIDGE_ENV,
  BRIDGE_PROTOCOL_VERSION,
  type BridgeAction,
  type BridgeActionName,
  type BridgeToStudio,
  type LinkedProject,
  type StudioToBridge,
  isBridgeToStudio,
} from "@hive/protocol";
import type { PiRpcConnection } from "@hive/pi-adapter/node";

export interface BridgeServerOptions {
  /** Override the pipe or socket path (defaults to auto-generated). */
  address?: string;
}

export interface BridgeSessionHandle {
  readonly address: string;
  readonly token: string;
  readonly env: Record<string, string>;
  isReady(): boolean;
  send(message: StudioToBridge): Promise<void>;
  setLinkedProjects(links: LinkedProject[]): Promise<void>;
  executeAction<T = unknown>(
    action: BridgeActionName,
    params: Record<string, unknown>,
    rpc: PiRpcConnection,
    timeoutMs?: number,
  ): Promise<T>;
  onMessage(listener: (message: BridgeToStudio) => void): () => void;
  close(): Promise<void>;
}

export function generateBridgeAddress(platform: NodeJS.Platform = process.platform): string {
  const id = randomBytes(6).toString("hex");
  if (platform === "win32") {
    return `\\\\.\\pipe\\hive-${process.pid}-${id}`;
  }
  // POSIX: unix socket path must stay short (< 104 bytes on macOS)
  return `/tmp/hive-${id}.sock`;
}

export async function createBridgeServer(
  options: BridgeServerOptions = {},
  platform: NodeJS.Platform = process.platform,
): Promise<BridgeSessionHandle> {
  const address = options.address ?? generateBridgeAddress(platform);
  const token = randomBytes(16).toString("hex");
  const listeners = new Set<(message: BridgeToStudio) => void>();
  const pendingActions = new Map<
    string,
    { resolve: (val: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  let activeSocket: Socket | null = null;
  let server: Server | null = null;
  let actionCounter = 0;
  let isAuthed = false;

  const splitter = new JsonlSplitter();

  server = createServer((socket) => {
    activeSocket = socket;
    socket.setEncoding("utf8");

    socket.on("data", (chunk: string) => {
      for (const line of splitter.push(chunk)) {
        try {
          const raw = JSON.parse(line) as unknown;
          if (!isBridgeToStudio(raw)) continue;

          if (raw.type === "hello") {
            if (raw.token !== token) {
              socket.destroy();
              return;
            }
            isAuthed = true;
          }

          if (!isAuthed) continue;

          if (raw.type === "command_result") {
            const pending = pendingActions.get(raw.id);
            if (pending) {
              pendingActions.delete(raw.id);
              clearTimeout(pending.timer);
              if (raw.ok) pending.resolve(raw.data);
              else pending.reject(new Error(raw.error ?? "Action failed"));
            }
          }

          for (const listener of [...listeners]) {
            try {
              listener(raw);
            } catch (err) {
              console.error("[bridge-server] listener error", err);
            }
          }
        } catch {
          // ignore malformed lines
        }
      }
    });

    socket.on("close", () => {
      if (activeSocket === socket) activeSocket = null;
    });

    socket.on("error", () => {
      // socket error
    });
  });

  await new Promise<void>((resolve, reject) => {
    server?.listen(address, () => resolve());
    server?.once("error", reject);
  });

  const send = async (msg: StudioToBridge): Promise<void> => {
    if (!activeSocket || activeSocket.destroyed) return;
    activeSocket.write(serializeRecord(msg));
  };

  const setLinkedProjects = async (links: LinkedProject[]): Promise<void> => {
    await send({
      v: BRIDGE_PROTOCOL_VERSION,
      type: "config",
      linkedProjects: links,
    });
  };

  const executeAction = async <T = unknown>(
    action: BridgeActionName,
    params: Record<string, unknown>,
    rpc: PiRpcConnection,
    timeoutMs = 15_000,
  ): Promise<T> => {
    const id = `act_${++actionCounter}`;
    const payload: BridgeAction = { id, action, ...params } as BridgeAction;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingActions.delete(id);
        reject(new Error(`Bridge action "${action}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      pendingActions.set(id, {
        resolve: (val) => resolve(val as T),
        reject,
        timer,
      });

      // Send via RPC hidden slash command
      rpc.send({
        type: "prompt",
        message: `/${BRIDGE_COMMAND} ${JSON.stringify(payload)}`,
      }).catch((err: unknown) => {
        pendingActions.delete(id);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  };

  const close = async (): Promise<void> => {
    for (const [, p] of pendingActions) {
      clearTimeout(p.timer);
      p.reject(new Error("Bridge server closed"));
    }
    pendingActions.clear();

    if (activeSocket) {
      activeSocket.destroy();
      activeSocket = null;
    }
    if (server) {
      await new Promise<void>((res) => server?.close(() => res()));
      server = null;
    }
  };

  return {
    address,
    token,
    env: {
      [BRIDGE_ENV.address]: address,
      [BRIDGE_ENV.token]: token,
    },
    isReady: () => isAuthed && activeSocket !== null && !activeSocket.destroyed,
    send,
    setLinkedProjects,
    executeAction,
    onMessage: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    close,
  };
}
