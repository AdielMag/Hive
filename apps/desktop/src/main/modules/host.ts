/**
 * Main-process module host: persists the enabled set (`<hive data>/modules.json`), resolves `requires`,
 * activates/disposes main entries, owns the module IPC gate and installs agent assets.
 *
 * Electron-free on purpose (the window `send` is injected) so it is unit-testable; ipc/modules.ts wires it up.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeToggle,
  indexManifests,
  normalizeEnabled,
  validateGraph,
  type ModuleManifest,
  type ModulesSnapshot,
  type SetModulesEnabledResult,
} from "@hive/module-sdk";
import { moduleChannel, type Disposer, type MainModule, type MainModuleContext, type ModuleLogger } from "@hive/module-sdk/main";
import { hasAgentAssets, installAgentAssets, removeAgentAssets, type InstalledAssets } from "./agent-assets.ts";

export const MODULES_FILE = "modules.json";

export interface ModulesStateFile {
  schema: 1;
  enabled: string[];
  onboarded: boolean;
  installedAssets: Record<string, InstalledAssets>;
}

export interface ModuleEventOut {
  moduleId: string;
  event: string;
  payload: unknown;
}

export interface MainModuleHostOptions {
  manifests: readonly ModuleManifest[];
  loaders: Readonly<Record<string, () => Promise<{ default: MainModule }>>>;
  hiveDataDir: string;
  piAgentDir: () => string;
  /** Folder of a module's shipped files (agent assets, bin). */
  moduleRoot: (id: string) => string;
  send: (msg: ModuleEventOut) => void;
  /** Install agent assets on enable / remove on disable (default true). */
  manageAgentAssets?: boolean;
  platform?: NodeJS.Platform;
  log?: ModuleLogger;
}

/** Files whose presence means Hive ran before (an upgrade, not a fresh install). */
const EXISTING_STATE_FILES = ["projects.json", "ui-state.json", "session-meta.json"];

type Handler = (...args: unknown[]) => unknown;

interface ActiveModule {
  handlers: Map<string, Handler>;
  disposers: Disposer[];
  disposed: boolean;
}

/**
 * Initial state when modules.json is missing:
 * - upgrade (existing Hive state found): every module on, no picker — nobody loses a feature.
 * - fresh install: the recommended tier on, picker shown (`onboarded: false`).
 */
export function initialModulesState(manifests: readonly ModuleManifest[], hiveDataDir: string): ModulesStateFile {
  const upgrade = EXISTING_STATE_FILES.some((f) => existsSync(join(hiveDataDir, f)));
  const ids = upgrade ? manifests.map((m) => m.id) : manifests.filter((m) => m.tier !== "bonus").map((m) => m.id);
  return { schema: 1, enabled: normalizeEnabled(manifests, ids), onboarded: upgrade, installedAssets: {} };
}

export class MainModuleHost {
  private readonly manifests: readonly ModuleManifest[];
  private readonly graph: Map<string, ModuleManifest>;
  private readonly file: string;
  private state: ModulesStateFile;
  private readonly active = new Map<string, ActiveModule>();
  private readonly activating = new Map<string, Promise<void>>();
  private readonly errors = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly log: ModuleLogger;

  constructor(private readonly opts: MainModuleHostOptions) {
    this.log = opts.log ?? console;
    const problems = validateGraph(opts.manifests);
    // A broken graph is a build bug; drop offending modules instead of refusing to boot.
    const bad = new Set(problems.map((p) => p.split(/[ :]/)[0] ?? ""));
    if (problems.length) this.log.error("[modules] invalid module graph:", problems);
    this.manifests = problems.length ? opts.manifests.filter((m) => !bad.has(m.id)) : opts.manifests;
    this.graph = indexManifests(this.manifests);
    this.file = join(opts.hiveDataDir, MODULES_FILE);
    this.state = this.load();
  }

  get binDir(): string {
    return join(this.opts.hiveDataDir, "bin");
  }

  private load(): ModulesStateFile {
    let raw: Partial<ModulesStateFile> | null = null;
    if (existsSync(this.file)) {
      try {
        raw = JSON.parse(readFileSync(this.file, "utf8")) as Partial<ModulesStateFile>;
      } catch (err) {
        this.log.error("[modules] modules.json is unreadable; rebuilding it", err);
      }
    }
    if (!raw || raw.schema !== 1 || !Array.isArray(raw.enabled)) {
      const fresh = initialModulesState(this.manifests, this.opts.hiveDataDir);
      if (raw?.installedAssets) fresh.installedAssets = raw.installedAssets;
      this.state = fresh;
      this.save();
      return fresh;
    }
    return {
      schema: 1,
      enabled: normalizeEnabled(this.manifests, raw.enabled.filter((x): x is string => typeof x === "string")),
      onboarded: raw.onboarded === true,
      installedAssets: raw.installedAssets && typeof raw.installedAssets === "object" ? raw.installedAssets : {},
    };
  }

  private save(): void {
    mkdirSync(this.opts.hiveDataDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
    renameSync(tmp, this.file);
  }

  /** Serializes state-changing operations. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }

  isEnabled(id: string): boolean {
    return this.state.enabled.includes(id);
  }

  isActive(id: string): boolean {
    return this.active.has(id);
  }

  getState(): Readonly<ModulesStateFile> {
    return this.state;
  }

  snapshot(): ModulesSnapshot {
    return {
      modules: this.manifests.map((manifest) => ({
        manifest,
        enabled: this.isEnabled(manifest.id),
        ...(this.errors.has(manifest.id) ? { error: this.errors.get(manifest.id) } : {}),
      })),
      enabled: [...this.state.enabled],
      onboarded: this.state.onboarded,
      binDir: this.binDir,
    };
  }

  /** Activates enabled modules (requirements first) and re-syncs agent assets. Call once at startup. */
  start(): Promise<string[]> {
    return this.run(async () => {
      const notices = this.syncAssets();
      for (const id of this.state.enabled) await this.activate(id);
      return notices;
    });
  }

  setEnabled(id: string, enabled: boolean): Promise<SetModulesEnabledResult> {
    return this.run(() => this.apply(computeToggle(this.manifests, this.state.enabled, id, enabled)));
  }

  setEnabledSet(ids: readonly string[]): Promise<SetModulesEnabledResult> {
    return this.run(() => this.apply(normalizeEnabled(this.manifests, ids)));
  }

  markOnboarded(): void {
    if (this.state.onboarded) return;
    this.state = { ...this.state, onboarded: true };
    this.save();
  }

  /** The IPC gate: only enabled, activated modules answer. */
  async invoke(id: string, method: string, args: readonly unknown[]): Promise<unknown> {
    if (!this.graph.has(id)) throw new Error(`Unknown module "${id}"`);
    if (!this.isEnabled(id)) throw new Error(`Module "${id}" is disabled`);
    await this.activating.get(id);
    const handler = this.active.get(id)?.handlers.get(moduleChannel(id, method));
    if (!handler) throw new Error(`Module "${id}" has no method "${method}"`);
    return handler(...args);
  }

  disposeAll(): Promise<void> {
    return this.run(async () => {
      for (const id of [...this.state.enabled].reverse()) await this.deactivate(id);
    });
  }

  private async apply(next: string[]): Promise<SetModulesEnabledResult> {
    const prev = this.state.enabled;
    const off = prev.filter((id) => !next.includes(id)).reverse(); // dependents first
    const on = next.filter((id) => !prev.includes(id)); // requirements first
    const notices: string[] = [];
    const installedAssets = { ...this.state.installedAssets };
    for (const id of off) {
      await this.deactivate(id);
      if (this.manageAssets) {
        notices.push(...removeAgentAssets(id, installedAssets[id]));
        delete installedAssets[id];
      }
    }
    this.state = { ...this.state, enabled: next, installedAssets };
    for (const id of on) {
      if (this.manageAssets) notices.push(...this.installAssets(id));
    }
    this.save();
    for (const id of on) await this.activate(id);
    return { enabled: [...next], notices };
  }

  private get manageAssets(): boolean {
    return this.opts.manageAgentAssets !== false;
  }

  private installAssets(id: string): string[] {
    const manifest = this.graph.get(id);
    if (!manifest) return [];
    const previous = this.state.installedAssets[id];
    if (!hasAgentAssets(manifest) && !previous) return [];
    try {
      const { record, notices } = installAgentAssets(
        manifest,
        this.opts.moduleRoot(id),
        { piAgentDir: this.opts.piAgentDir(), binDir: this.binDir, platform: this.opts.platform },
        previous,
      );
      this.state.installedAssets = { ...this.state.installedAssets, [id]: record };
      return notices;
    } catch (err) {
      const msg = `Failed to install agent assets for "${id}": ${err instanceof Error ? err.message : String(err)}`;
      this.log.error(`[modules] ${msg}`);
      return [msg];
    }
  }

  /** Startup re-sync: install for enabled modules, remove leftovers of disabled/removed ones. */
  private syncAssets(): string[] {
    if (!this.manageAssets) return [];
    const notices: string[] = [];
    for (const id of Object.keys(this.state.installedAssets)) {
      if (this.isEnabled(id)) continue;
      notices.push(...removeAgentAssets(id, this.state.installedAssets[id]));
      const { [id]: _removed, ...rest } = this.state.installedAssets;
      this.state.installedAssets = rest;
    }
    for (const id of this.state.enabled) notices.push(...this.installAssets(id));
    this.save();
    for (const n of notices) this.log.warn(`[modules] ${n}`);
    return notices;
  }

  private activate(id: string): Promise<void> {
    if (this.active.has(id)) return Promise.resolve();
    const pending = this.activating.get(id);
    if (pending) return pending;
    const loader = this.opts.loaders[id];
    if (!loader) return Promise.resolve(); // renderer-only module
    const entry: ActiveModule = { handlers: new Map(), disposers: [], disposed: false };
    const ctx: MainModuleContext = {
      moduleId: id,
      ipc: {
        handle: (method, fn) => {
          entry.handlers.set(moduleChannel(id, method), fn as Handler);
        },
        emit: (event, payload) => {
          if (!entry.disposed) this.opts.send({ moduleId: id, event, payload });
        },
      },
      paths: {
        hiveData: this.opts.hiveDataDir,
        piAgentDir: this.opts.piAgentDir(),
        moduleRoot: this.opts.moduleRoot(id),
        moduleData: () => {
          const dir = join(this.opts.hiveDataDir, "modules", id);
          mkdirSync(dir, { recursive: true });
          return dir;
        },
      },
      log: {
        info: (...a) => this.log.info(`[module:${id}]`, ...a),
        warn: (...a) => this.log.warn(`[module:${id}]`, ...a),
        error: (...a) => this.log.error(`[module:${id}]`, ...a),
      },
      onDispose: (fn) => entry.disposers.push(fn),
    };
    const p = (async () => {
      try {
        const mod = (await loader()).default;
        const disposer = await mod.activate(ctx);
        if (typeof disposer === "function") entry.disposers.push(disposer);
        this.active.set(id, entry);
        this.errors.delete(id);
      } catch (err) {
        entry.disposed = true;
        await runDisposers(entry, this.log, id);
        const msg = err instanceof Error ? err.message : String(err);
        this.errors.set(id, msg);
        this.log.error(`[modules] failed to activate "${id}":`, err);
      } finally {
        this.activating.delete(id);
      }
    })();
    this.activating.set(id, p);
    return p;
  }

  private async deactivate(id: string): Promise<void> {
    await this.activating.get(id);
    const entry = this.active.get(id);
    if (!entry) return;
    this.active.delete(id);
    entry.disposed = true;
    entry.handlers.clear();
    await runDisposers(entry, this.log, id);
  }
}

async function runDisposers(entry: ActiveModule, log: ModuleLogger, id: string): Promise<void> {
  for (const fn of entry.disposers.splice(0).reverse()) {
    try {
      await fn();
    } catch (err) {
      log.error(`[modules] dispose of "${id}" failed:`, err);
    }
  }
}
