/**
 * Renderer-side module registry. Holds the enabled modules' loaded code and their contributions, and keeps
 * the command registry in sync (real commands for enabled modules, "Enable X" stubs for disabled ones).
 * Core never imports a module by name: code is reached only through the generated lazy loaders.
 */
import { useMemo } from "react";
import { create } from "zustand";
import type { SetModulesEnabledResult } from "@hive/module-sdk";
import type {
  CommandContribution,
  ContributionPoint,
  ModuleHost,
  RendererContributions,
  RendererModule,
} from "@hive/module-sdk/renderer";
import { RENDERER_MODULE_LOADERS } from "../modules.generated.ts";
import { registerCommands } from "../features/commands/registry.ts";
import type { Command } from "../features/commands/types.ts";
import { MODULE_MANIFESTS, manifestById } from "./manifests.ts";
import { subscribeSessionEvents } from "./session-bus.ts";
import { toast } from "./toast-store.ts";

export interface LoadedModule {
  module: RendererModule;
  host: ModuleHost;
  /** Undoes everything the module registered in the renderer. */
  cleanup: Array<() => void>;
}

export type Contributed<P extends ContributionPoint> = NonNullable<RendererContributions[P]>[number] & { moduleId: string };

interface ModulesState {
  /** True once the first snapshot from main has been applied. */
  ready: boolean;
  enabled: string[];
  onboarded: boolean;
  binDir: string;
  /** Per-module problems: main activation errors and renderer load errors. */
  errors: Record<string, string>;
  /** Messages from the last enable/disable (e.g. "kept skill X because you edited it"). */
  notices: string[];
  loaded: Record<string, LoadedModule>;
  init(): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<SetModulesEnabledResult>;
  setEnabledSet(ids: string[]): Promise<SetModulesEnabledResult>;
  markOnboarded(): Promise<void>;
  clearNotices(): void;
}

/** `createModuleHost` lives in host.tsx; injected to keep this file free of UI imports (and testable). */
type HostFactory = (moduleId: string) => ModuleHost;
let hostFactory: HostFactory | null = null;
export function setModuleHostFactory(factory: HostFactory): void {
  hostFactory = factory;
}

let syncChain: Promise<void> = Promise.resolve();
let stubCleanups: Array<() => void> = [];

const toCommand = (c: CommandContribution, host: ModuleHost): Command => ({
  id: c.id,
  title: c.title,
  category: c.category ?? "Modules",
  keywords: c.keywords,
  defaultKeys: c.defaultKeys,
  allowInTerminal: c.allowInTerminal,
  when: c.when ? () => c.when!(host) : undefined,
  run: (args) => c.run(host, args),
});

export const useModules = create<ModulesState>((set, get) => {
  const applySnapshot = async (): Promise<void> => {
    const snap = await window.studio.modules.list();
    const errors: Record<string, string> = { ...get().errors };
    for (const m of snap.modules) {
      if (m.error) errors[m.manifest.id] = m.error;
      else if (!(m.manifest.id in get().loaded)) delete errors[m.manifest.id];
    }
    set({ enabled: snap.enabled, onboarded: snap.onboarded, binDir: snap.binDir, errors });
  };

  const loadModule = async (id: string): Promise<void> => {
    const loader = RENDERER_MODULE_LOADERS[id];
    if (!loader || id in get().loaded) return;
    try {
      if (!hostFactory) throw new Error("module host factory is not set");
      const mod = (await loader()).default;
      const host = hostFactory(id);
      const cleanup: Array<() => void> = [];
      const commands = mod.contributes?.commands;
      if (commands?.length) cleanup.push(registerCommands(commands.map((c) => toCommand(c, host))));
      if (mod.onSessionEvent) cleanup.push(subscribeSessionEvents((evt) => mod.onSessionEvent!(evt, host)));
      const off = mod.activate?.(host);
      if (typeof off === "function") cleanup.push(off);
      set((s) => ({ loaded: { ...s.loaded, [id]: { module: mod, host, cleanup } } }));
    } catch (err) {
      console.error(`[modules] failed to load renderer half of ${id}`, err);
      set((s) => ({ errors: { ...s.errors, [id]: err instanceof Error ? err.message : String(err) } }));
    }
  };

  const unloadModule = (id: string): void => {
    const entry = get().loaded[id];
    if (!entry) return;
    for (const fn of entry.cleanup.reverse()) {
      try {
        fn();
      } catch (err) {
        console.error(`[modules] cleanup failed for ${id}`, err);
      }
    }
    set((s) => {
      const { [id]: _gone, ...rest } = s.loaded;
      return { loaded: rest };
    });
  };

  /** Disabled modules that declare commands statically get a stub that offers to enable the module. */
  const syncStubs = (): void => {
    for (const fn of stubCleanups) fn();
    stubCleanups = [];
    const enabled = new Set(get().enabled);
    const stubs: Command[] = [];
    for (const m of MODULE_MANIFESTS) {
      if (enabled.has(m.id)) continue;
      for (const c of m.contributes?.commands ?? []) {
        stubs.push({
          id: c.id,
          title: c.title,
          category: c.category ?? "Modules",
          defaultKeys: c.keys,
          allowInTerminal: true,
          run: () => {
            toast({
              message: `${m.title} isn't installed.`,
              action: { label: "Enable", run: () => void get().setEnabled(m.id, true) },
            });
          },
        });
      }
    }
    if (stubs.length) stubCleanups.push(registerCommands(stubs));
  };

  /** Brings loaded modules in line with `enabled`. Serialised so rapid toggles can't interleave. */
  const sync = (): Promise<void> => {
    syncChain = syncChain.then(async () => {
      const wanted = new Set(get().enabled);
      for (const id of Object.keys(get().loaded)) if (!wanted.has(id)) unloadModule(id);
      for (const id of wanted) await loadModule(id);
      syncStubs();
    });
    return syncChain;
  };

  const change = async (run: () => Promise<SetModulesEnabledResult>): Promise<SetModulesEnabledResult> => {
    const result = await run();
    set({ notices: result.notices });
    await applySnapshot();
    set({ enabled: result.enabled });
    await sync();
    return result;
  };

  return {
    ready: false,
    enabled: [],
    onboarded: true,
    binDir: "",
    errors: {},
    notices: [],
    loaded: {},
    init: async () => {
      if (get().ready) return;
      await applySnapshot();
      set({ ready: true });
      await sync();
    },
    setEnabled: (id, enabled) => change(() => window.studio.modules.setEnabled(id, enabled)),
    setEnabledSet: (ids) => change(() => window.studio.modules.setEnabledSet(ids)),
    markOnboarded: async () => {
      await window.studio.modules.markOnboarded();
      set({ onboarded: true });
    },
    clearNotices: () => set({ notices: [] }),
  };
});

/** Flattens one contribution point across loaded modules, tagged with the owning module, ordered by `order`. */
export function collectContributions<P extends ContributionPoint>(
  loaded: Readonly<Record<string, Pick<LoadedModule, "module">>>,
  point: P,
): Contributed<P>[] {
  const out: Array<Contributed<P> & { order?: number }> = [];
  for (const [moduleId, { module }] of Object.entries(loaded)) {
    const items = (module.contributes?.[point] ?? []) as Array<NonNullable<RendererContributions[P]>[number]>;
    for (const item of items) out.push({ ...(item as object), moduleId } as Contributed<P> & { order?: number });
  }
  return out
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (a.item.order ?? 100) - (b.item.order ?? 100) || a.i - b.i)
    .map((x) => x.item);
}

/** Subscribes a component to a contribution point (re-renders when modules load/unload). */
export function useContributions<P extends ContributionPoint>(point: P): Contributed<P>[] {
  const loaded = useModules((s) => s.loaded);
  return useMemo(() => collectContributions(loaded, point), [loaded, point]);
}

/** Components contributed to a named extension point. */
export function useSlot(name: string): Array<{ moduleId: string; Component: NonNullable<RendererContributions["slots"]>[string][number] }> {
  const loaded = useModules((s) => s.loaded);
  return useMemo(() => {
    const out: Array<{ moduleId: string; Component: NonNullable<RendererContributions["slots"]>[string][number] }> = [];
    for (const [moduleId, { module }] of Object.entries(loaded)) {
      for (const Component of module.contributes?.slots?.[name] ?? []) out.push({ moduleId, Component });
    }
    return out;
  }, [loaded, name]);
}

export const useModuleHost = (moduleId: string): ModuleHost | undefined => useModules((s) => s.loaded[moduleId]?.host);

export { manifestById };
