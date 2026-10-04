/**
 * Renderer side of a module (`modules/<id>/src/renderer.tsx`). A module contributes UI declaratively and talks
 * to core only through the `ModuleHost` it receives — never through `apps/desktop/src/renderer/**` internals.
 */
import type { ComponentType, ReactNode } from "react";

/** The subset of a workbench tab a module sees. `data` carries module-specific state. */
export interface ModuleTab {
  id: string;
  kind?: string;
  title: string;
  projectId: string;
  filePath?: string;
  url?: string;
  favicon?: string;
  isSleeping?: boolean;
  lastActiveAt?: number;
  data?: Record<string, unknown>;
}

export interface OpenTabSpec {
  kind: string;
  title: string;
  /** Explicit id; defaults to `<kind>-<random>`. */
  id?: string;
  filePath?: string;
  url?: string;
  isSleeping?: boolean;
  lastActiveAt?: number;
  data?: Record<string, unknown>;
  /**
   * Reuse an existing tab of the same kind instead of opening a duplicate. Defaults to matching `filePath`
   * when given, else `id`.
   */
  reuse?: (tab: ModuleTab) => boolean;
}

export type PanelSide = "left" | "right";

export interface ToastOptions {
  message: string;
  kind?: "info" | "success" | "warning" | "error";
  action?: { label: string; run: () => void | Promise<void> };
  /** ms; 0 keeps it until dismissed. Default 5000. */
  duration?: number;
}

/** A Pi session stream event, as forwarded by core. */
export interface ModuleSessionEvent {
  /** Session key (main-process id of the live Pi process). */
  key: string;
  /** Whether this is the session shown in the active tab. */
  active: boolean;
  event: { type: string; [k: string]: unknown };
}

export interface ModuleHostIpc {
  invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
  on<T = unknown>(event: string, listener: (payload: T) => void): () => void;
}

/** A Pi session known to Hive (subset of core's catalog item). */
export interface SessionCatalogLite {
  path: string;
  title?: string;
  name?: string;
  firstMessage?: string;
}

/** The model a core "AI feature" resolves to under the user's Settings → Models preference. */
export interface ResolvedFeatureModelLite {
  id: string;
  name: string;
  shortName: string;
  provider?: string;
  source: "session" | "pi-default" | "custom" | "heuristic";
  sourceLabel: string;
  /** True when the user chose deterministic local rules instead of an LLM. */
  isHeuristic?: boolean;
}

export interface ModuleHost {
  moduleId: string;
  tabs: {
    open(spec: OpenTabSpec): string;
    close(tabId: string): void;
    update(tabId: string, patch: Partial<ModuleTab> & Record<string, unknown>): void;
    active(): ModuleTab | undefined;
    list(): ModuleTab[];
    /** Fires whenever the tab list or the active tab changes. */
    onChange(listener: () => void): () => void;
  };
  panels: {
    open(side: PanelSide, panelId: string): void;
    toggle(side: PanelSide, panelId: string): void;
    close(side: PanelSide): void;
  };
  toast(options: string | ToastOptions): void;
  commands: {
    /** Run any registered command (core or another module's) by id. No-op when it is not registered. */
    run(commandId: string, args?: unknown): Promise<void>;
    /** True while a command is registered (i.e. its module is enabled). */
    has(commandId: string): boolean;
  };
  settings: {
    open(tabId?: string): void;
  };
  openExternal(url: string): Promise<void>;
  /** Persistent key/value storage (localStorage with Hive's legacy-key migration). Keys are used verbatim. */
  storage: {
    get(key: string): string | null;
    set(key: string, value: string): void;
  };
  /** React hooks bound to core state (call only during render). */
  hooks: {
    useSessionCatalog(): SessionCatalogLite[];
    /** Resolve an AI feature (declared via `aiFeatures`) to the model chosen in Settings → Models. */
    useFeatureModel(featureId: string): ResolvedFeatureModelLite;
  };
  links: {
    /** Claim clicked external links (otherwise they open in the system browser). Returns a disposer. */
    setHandler(handler: (url: string, title?: string) => void): () => void;
  };
  ui: {
    Markdown: ComponentType<{ text: string; className?: string }>;
    /** Core model chip; `model` is the resolved feature model (see host.ai). */
    AiModelChip: ComponentType<{ model: any; className?: string; clickable?: boolean; title?: string; feature?: string }>;
    CodeBlock: ComponentType<{ code: string; language?: string | null; fileName?: string; collapseAfter?: number; [key: string]: any }>;
    ProviderIcon: ComponentType<{ provider: string; size?: number; className?: string; style?: React.CSSProperties }>;
  };
  models: {
    catalog(): any[];
    enabledKeys(): string[];
    loadCatalog(): Promise<void>;
  };
  clipboard: {
    copy(text: string): Promise<boolean>;
  };
  theme: {
    isDark(): boolean;
    subscribe(listener: (dark: boolean) => void): () => void;
  };
  sessions: {
    onEvent(listener: (evt: ModuleSessionEvent) => void): () => void;
    activeProject(): { id: string; name: string; path: string } | null;
    /** Set the active session's agent mode (e.g. "auto-edit", "manual"). */
    setMode(mode: string): void;
    /** Stage text in the active composer prompt. */
    setPrompt(text: string): void;
  };
  ipc: ModuleHostIpc;
}

export interface ContributionBase {
  /** Lower first; default 100. */
  order?: number;
}

export type IconComponent = ComponentType<{ size?: number; className?: string }>;

export interface PanelContribution extends ContributionBase {
  id: string;
  title: string;
  icon: IconComponent;
  /** Command whose shortcut is shown in the rail tooltip. */
  commandId?: string;
  component: ComponentType<{ host: ModuleHost }>;
}

export interface TabKindContribution {
  kind: string;
  /** Title override for the tab strip (defaults to `tab.title`). */
  title?: (tab: ModuleTab) => string;
  icon?: ComponentType<{ size?: number; tab: ModuleTab }>;
  component: ComponentType<{ tab: ModuleTab; host: ModuleHost }>;
}

export interface SettingsContribution extends ContributionBase {
  id: string;
  /** Nav label. */
  label: string;
  /** Page heading (defaults to label). */
  title?: string;
  icon?: IconComponent;
  component: ComponentType<{ host: ModuleHost }>;
}

export interface CommandContribution {
  id: string;
  title: string;
  category?: string;
  keywords?: string;
  defaultKeys?: string[];
  allowInTerminal?: boolean;
  when?: (host: ModuleHost) => boolean;
  /** `args` is whatever the caller passed to `host.commands.run(id, args)` (undefined for palette / shortcuts). */
  run: (host: ModuleHost, args?: unknown) => void | Promise<void>;
}

export interface StatusBarContribution extends ContributionBase {
  id: string;
  /**
   * Pi extension status keys this item replaces (e.g. a built-in quota meter hides the extension's own).
   * Core hides them only while the contribution is active.
   */
  hideExtensionStatuses?: string[];
  component: ComponentType<{ host: ModuleHost }>;
}

export interface TitleMenuContribution extends ContributionBase {
  /** Title-bar menu name: "File" | "View" | "Help" (others are ignored). */
  menu: string;
  label: string;
  command: string;
}

export interface AiFeatureContribution {
  id: string;
  label: string;
  description?: string;
}

export type SlotComponent = ComponentType<{ host: ModuleHost; [prop: string]: unknown }>;

export interface RailItemContribution extends ContributionBase {
  id: string;
  title: string;
  icon: IconComponent;
  commandId?: string;
  active?: (host: ModuleHost) => boolean;
  onClick: (host: ModuleHost) => void;
}

export interface RendererContributions {
  leftPanels?: PanelContribution[];
  rightPanels?: PanelContribution[];
  tabKinds?: TabKindContribution[];
  railItems?: RailItemContribution[];
  settings?: SettingsContribution[];
  commands?: CommandContribution[];
  statusBar?: StatusBarContribution[];
  titleMenu?: TitleMenuContribution[];
  /** Named extension points rendered by core (`<Slot name="…" />`). */
  slots?: Record<string, SlotComponent[]>;
  aiFeatures?: AiFeatureContribution[];
}

export type ContributionPoint = Exclude<keyof RendererContributions, "slots">;

export interface RendererModule {
  id: string;
  contributes?: RendererContributions;
  /** Runs once when the module loads in the renderer (subscribe to module IPC events here). */
  activate?(host: ModuleHost): void | (() => void);
  onSessionEvent?(evt: ModuleSessionEvent, host: ModuleHost): void;
}

export function defineRendererModule<M extends RendererModule>(mod: M): M {
  return mod;
}

/** Re-exported for module authors that render children through slots. */
export type { ReactNode };
