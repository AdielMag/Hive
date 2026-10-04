/**
 * Main-process side of a module (`modules/<id>/src/main.ts`). `activate` runs only while the module is
 * enabled; everything it starts must be torn down by the returned disposer (or `ctx.onDispose`).
 */

export type Disposer = () => void | Promise<void>;

export interface ModuleLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface MainModuleIpc {
  /**
   * Handle `window.studio.modules.invoke(<id>, method, ...args)` from the renderer. Namespaced to
   * `mod:<id>:<method>`; calls are rejected while the module is disabled.
   */
  handle<A extends unknown[], R>(method: string, fn: (...args: A) => R | Promise<R>): void;
  /** Push an event to the renderer (`window.studio.modules.on(<id>, event, cb)` / `host.ipc.on`). */
  emit(event: string, payload?: unknown): void;
}

export interface MainModulePaths {
  /** `<hive data dir>/modules/<id>`, created on first call. */
  moduleData(): string;
  /** `<userData>/hive`. */
  hiveData: string;
  /** Pi's agent dir (`~/.pi/agent` or PI_CODING_AGENT_DIR). */
  piAgentDir: string;
  /** The module's own folder (unpacked in packaged builds), for shipped assets. */
  moduleRoot: string;
}

/** The Pi installation Hive found (structurally compatible with `PiInstallInfo` in @hive/protocol). */
export interface PiRuntimeInfo {
  version: string;
  /** Node executable used to run Pi. */
  nodePath: string;
  cliPath: string;
  /** Root of the @earendil-works/pi-coding-agent package. */
  packageRoot: string;
}

export interface MainModuleContext {
  moduleId: string;
  /** Pi install, or null when Pi was not found. Read lazily: the user can relocate Pi at runtime. */
  pi(): PiRuntimeInfo | null;
  ipc: MainModuleIpc;
  paths: MainModulePaths;
  log: ModuleLogger;
  /** Register extra cleanup; runs (in reverse order) when the module is disabled or the app quits. */
  onDispose(fn: Disposer): void;
}

export interface MainModule {
  id: string;
  activate(ctx: MainModuleContext): void | Disposer | Promise<void | Disposer>;
}

export function defineMainModule<M extends MainModule>(mod: M): M {
  return mod;
}

/** IPC channel used for a module method. */
export function moduleChannel(moduleId: string, method: string): string {
  return `mod:${moduleId}:${method}`;
}
