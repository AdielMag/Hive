/**
 * One `pi --mode rpc` child process (docs/rpc.md).
 *
 * - Commands carry a unique `id`; responses are correlated by id, never by order.
 * - stdout is split with strict LF framing (JsonlSplitter); stderr is diagnostics only.
 * - Writes honor stdin backpressure.
 * - Shutdown closes stdin (Pi's orderly path), then kills the process tree after a grace period.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import type { RpcExtensionUIRequest, RpcExtensionUIResponse, RpcResponse } from "@earendil-works/pi-coding-agent";
import type { PiStreamEvent, StudioRpcCommand } from "@pi-studio/protocol";
import { JsonlSplitter, serializeRecord } from "../jsonl.ts";
import { killProcessTree } from "./kill.ts";

export interface PiRpcConnectionOptions {
  nodePath: string;
  cliPath: string;
  cwd: string;
  /** Extra CLI arguments after `--mode rpc`. */
  args?: readonly string[];
  env?: NodeJS.ProcessEnv;
  /** Characters of stderr retained for diagnostics (default 64 KiB). */
  stderrLimit?: number;
}

export interface PiExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: string;
}

export interface SendOptions {
  /** Reject if no response arrives in time (default: no timeout). */
  timeoutMs?: number;
}

type Listener<T> = (value: T) => void;

interface Pending {
  resolve: (response: RpcResponse) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export class PiRpcError extends Error {
  constructor(
    message: string,
    readonly command: string,
  ) {
    super(message);
    this.name = "PiRpcError";
  }
}

export class PiRpcConnection {
  private child: ChildProcess | null = null;
  private readonly splitter = new JsonlSplitter();
  private readonly pending = new Map<string, Pending>();
  private nextId = 0;
  private stderrText = "";
  private exitInfo: PiExit | null = null;
  private exitWaiters: Array<(exit: PiExit) => void> = [];
  private writeChain: Promise<void> = Promise.resolve();
  private readonly eventListeners = new Set<Listener<PiStreamEvent>>();
  private readonly uiListeners = new Set<Listener<RpcExtensionUIRequest>>();
  private readonly exitListeners = new Set<Listener<PiExit>>();
  private readonly protocolErrorListeners = new Set<Listener<string>>();

  constructor(private readonly options: PiRpcConnectionOptions) {}

  get pid(): number | undefined {
    return this.child?.pid;
  }

  get exited(): PiExit | null {
    return this.exitInfo;
  }

  get stderr(): string {
    return this.stderrText;
  }

  /** Spawn the process. Resolves once the OS reports it started (not when Pi is ready). */
  async start(): Promise<void> {
    if (this.child) throw new Error("PiRpcConnection already started");
    const { nodePath, cliPath, cwd, args = [], env } = this.options;
    const child = spawn(nodePath, [cliPath, "--mode", "rpc", ...args], {
      cwd,
      env: env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      // POSIX: own process group so the whole tree can be signalled.
      detached: process.platform !== "win32",
    });
    this.child = child;

    child.stdout?.on("data", (chunk: Buffer) => {
      for (const line of this.splitter.push(chunk)) this.handleLine(line);
    });
    child.stdout?.on("end", () => {
      for (const line of this.splitter.end()) this.handleLine(line);
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (text: string) => {
      const limit = this.options.stderrLimit ?? 64 * 1024;
      this.stderrText = (this.stderrText + text).slice(-limit);
    });
    child.stdin?.on("error", () => {
      // EPIPE after the child exits; the exit handler reports it.
    });
    child.on("exit", (code, signal) => this.handleExit({ code, signal }));

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => resolve());
      child.once("error", (error) => {
        this.handleExit({ code: null, signal: null, error: error.message });
        reject(error);
      });
    });
  }

  /** Send a command and wait for its response (success or failure record). */
  send(command: StudioRpcCommand, options: SendOptions = {}): Promise<RpcResponse> {
    if (this.exitInfo || !this.child) {
      return Promise.reject(new PiRpcError("Pi process is not running", command.type));
    }
    const id = `s${++this.nextId}`;
    return new Promise<RpcResponse>((resolve, reject) => {
      const pending: Pending = { resolve, reject };
      if (options.timeoutMs) {
        pending.timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new PiRpcError(`Timed out after ${options.timeoutMs} ms waiting for ${command.type}`, command.type));
        }, options.timeoutMs);
      }
      this.pending.set(id, pending);
      this.write({ ...command, id }).catch((error: unknown) => {
        this.pending.delete(id);
        if (pending.timer) clearTimeout(pending.timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  /** Send a command and return its `data`, throwing on `success: false`. */
  async request<T = unknown>(command: StudioRpcCommand, options?: SendOptions): Promise<T> {
    const response = await this.send(command, options);
    if (!response.success) throw new PiRpcError(response.error, command.type);
    return (response as { data?: unknown }).data as T;
  }

  /** Answer an extension dialog (docs/rpc-extension-ui.md). */
  respondUi(response: RpcExtensionUIResponse): Promise<void> {
    return this.write(response);
  }

  onEvent(listener: Listener<PiStreamEvent>): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onUiRequest(listener: Listener<RpcExtensionUIRequest>): () => void {
    this.uiListeners.add(listener);
    return () => this.uiListeners.delete(listener);
  }

  onExit(listener: Listener<PiExit>): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  onProtocolError(listener: Listener<string>): () => void {
    this.protocolErrorListeners.add(listener);
    return () => this.protocolErrorListeners.delete(listener);
  }

  waitForExit(): Promise<PiExit> {
    if (this.exitInfo) return Promise.resolve(this.exitInfo);
    return new Promise((resolve) => this.exitWaiters.push(resolve));
  }

  /** Orderly shutdown: close stdin, wait `graceMs`, then kill the process tree. */
  async stop(graceMs = 3000): Promise<PiExit> {
    const child = this.child;
    if (!child || this.exitInfo) return this.exitInfo ?? { code: null, signal: null };
    child.stdin?.end();
    const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), graceMs));
    const result = await Promise.race([this.waitForExit(), timeout]);
    if (result === "timeout" && child.pid !== undefined) {
      await killProcessTree(child.pid);
      const hardTimeout = new Promise<PiExit>((resolve) =>
        setTimeout(() => resolve({ code: null, signal: null, error: "did not exit after kill" }), 3000),
      );
      return Promise.race([this.waitForExit(), hardTimeout]);
    }
    return this.waitForExit();
  }

  private write(record: unknown): Promise<void> {
    const stdin = this.child?.stdin;
    const data = serializeRecord(record);
    this.writeChain = this.writeChain.then(async () => {
      if (!stdin || stdin.destroyed || this.exitInfo) throw new PiRpcError("Pi process is not running", "write");
      if (!stdin.write(data)) await once(stdin, "drain");
    });
    return this.writeChain;
  }

  private handleLine(line: string): void {
    let record: { type?: string; id?: string; command?: string; error?: string };
    try {
      record = JSON.parse(line) as typeof record;
    } catch {
      this.emit(this.protocolErrorListeners, `Unparseable stdout record: ${line.slice(0, 200)}`);
      return;
    }
    if (record.type === "response") {
      const pending = record.id ? this.pending.get(record.id) : undefined;
      if (pending && record.id) {
        this.pending.delete(record.id);
        if (pending.timer) clearTimeout(pending.timer);
        pending.resolve(record as RpcResponse);
      } else if (record.command === "parse") {
        this.emit(this.protocolErrorListeners, `Pi could not parse a command: ${record.error ?? "unknown error"}`);
      }
      return;
    }
    if (record.type === "extension_ui_request") {
      this.emit(this.uiListeners, record as RpcExtensionUIRequest);
      return;
    }
    this.emit(this.eventListeners, record as PiStreamEvent);
  }

  private handleExit(exit: PiExit): void {
    if (this.exitInfo) return;
    this.exitInfo = exit;
    const tail = this.stderrText.trim().split("\n").slice(-5).join("\n");
    for (const [id, pending] of this.pending) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(
        new PiRpcError(`Pi exited (code ${exit.code ?? "?"})${tail ? `: ${tail}` : ""}`, `pending ${id}`),
      );
    }
    this.pending.clear();
    for (const waiter of this.exitWaiters) waiter(exit);
    this.exitWaiters = [];
    this.emit(this.exitListeners, exit);
  }

  private emit<T>(listeners: Set<Listener<T>>, value: T): void {
    for (const listener of [...listeners]) {
      try {
        listener(value);
      } catch (error) {
        // A listener bug must never break the protocol reader.
        console.error("[pi-adapter] listener failed", error);
      }
    }
  }
}
