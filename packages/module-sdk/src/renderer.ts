/**
 * Renderer side of a module (`modules/<id>/src/renderer.tsx`). A module contributes UI declaratively and talks
 * to core only through the `ModuleHost` it receives — never through `apps/desktop/src/renderer/**` internals.
 */
import type { ComponentType, ReactNode } from "react";
import type { TranscriptState } from "@hive/pi-adapter";
import type { SessionRegistry } from "@hive/protocol";
import type { ArcTheme } from "@hive/theme-engine";

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
  /** Project the tab belongs to; defaults to the active project. */
  projectId?: string;
  /** Explicit id; defaults to `<kind>-<random>`. */
  id?: string;
  filePath?: string;
  url?: string;
  isSleeping?: boolean;
  lastActiveAt?: number;
  data?: Record<string, unknown>;
  /**
   * Open the tab where the Pi session that triggered it lives: same project, same pane, right after that
   * session's tab. Falls back to the project containing `cwd`, then to the active project.
   */
  origin?: { sessionFile?: string; sessionId?: string; cwd?: string };
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
  /** Suppress notification sound */
  silent?: boolean;
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
  /** Calls a method of another module this one `requires` (e.g. branches → git). Rejects while that module is disabled. */
  invokeOf<T = unknown>(moduleId: string, method: string, ...args: unknown[]): Promise<T>;
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
export interface ActiveSessionContext {
  project: { id: string; name: string; path: string } | null;
  transcript: TranscriptState;
  registry: SessionRegistry | null;
  /** Model selected in the active session tab (provider is Pi's provider id, e.g. "antigravity"). */
  model: { provider: string; id: string; name?: string } | null;
  /** Increments after each Pi reload (extensions, skills, prompts); re-fetch anything cached from them when it changes. */
  reloadEpoch: number;
}

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

export interface FileTreeNode {
  name: string;
  path: string;
  relativePath?: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
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
  sound?: {
    play(soundId: string): void;
  };
  commands: {
    /** Run any registered command (core or another module's) by id. No-op when it is not registered. */
    run(commandId: string, args?: unknown): Promise<void>;
    /** True while a command is registered (i.e. its module is enabled). */
    has(commandId: string): boolean;
  };
  settings: {
    open(tabId?: string, focus?: { providerId: string; reason?: string }): void;
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
    /** Active project, live transcript state and session registry. */
    useActiveSession(): ActiveSessionContext;
    /** Current Arc theme & editor preferences with reactive setters. */
    useTheme(): {
      theme: ArcTheme;
      editor: { codeFontSize: number; ligatures: boolean; wrapCode: boolean };
      setTheme(patch: Partial<ArcTheme>): void;
      replaceTheme(theme: ArcTheme): void;
      setEditor(patch: Partial<{ codeFontSize: number; ligatures: boolean; wrapCode: boolean }>): void;
      reset(): void;
    };
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
    /**
     * Syntax-highlighted source with line numbers (no frame). `language` is a language id (see `host.languages`);
     * `wrap` defaults to the user's "wrap code" editor preference.
     */
    HighlightedSource: ComponentType<{ code: string; language?: string | null; wrap?: boolean; lineNumbers?: boolean }>;
    /** Unified-diff renderer (the same one used for inline transcript diffs). */
    DiffView: ComponentType<{ diff: string; language?: string | null }>;
    ProviderIcon: ComponentType<{ provider: string; size?: number; className?: string; style?: React.CSSProperties }>;
    ContextBreakdownPanel: ComponentType<{ host: ModuleHost }>;
    /** Renders everything modules contributed to the named slot (`RendererContributions.slots`); `props` reach each slot component. */
    Slot: ComponentType<{ name: string; props?: Record<string, unknown> }>;
  };
  /** Language helpers backed by core's highlighter tables. */
  languages: {
    /** Language id for a file path, or null when unknown. */
    fromPath(path: string | undefined | null): string | null;
    /** Normalises a raw language name (alias / extension) to a language id. */
    resolve(name: string | undefined | null): string | null;
    /** Human-readable label, e.g. "TypeScript". */
    label(language: string | null, raw?: string): string;
  };
  /** Read-only file access routed through core (the same IPC the composer uses for attachments). */
  files: {
    read(filePath: string): Promise<{ content: string; language: string; mimeType?: string; isBinary?: boolean; dataUrl?: string; [key: string]: unknown }>;
    readMedia?(filePath: string): Promise<{ data: string; mimeType: string; size: number; name: string }>;
    showInFolder?(filePath: string): Promise<void>;
    /** Directory tree of `dirPath` (nodes: `{ name, path, relativePath?, isDirectory, children? }`). */
    list(dirPath: string): Promise<FileTreeNode[]>;
  };
  models: {
    catalog(): any[];
    enabledKeys(): string[];
    loadCatalog(): Promise<void>;
  };
  clipboard: {
    copy(text: string): Promise<boolean>;
    copyImage?(src: string): Promise<boolean>;
  };
  theme: {
    isDark(): boolean;
    subscribe(listener: (dark: boolean) => void): () => void;
  };
  sessions: {
    onEvent(listener: (evt: ModuleSessionEvent) => void): () => void;
    /** Custom records the session's Pi extensions publish on the bridge (core's `studio:to-gui` topic). */
    onBridgeEvent(listener: (evt: { key: string; data: unknown }) => void): () => void;
    /** Send a custom record to a session's Pi extensions over the bridge (`studio:from-gui`). */
    emitToBridge(key: string, data: unknown): Promise<void>;
    activeProject(): { id: string; name: string; path: string } | null;
    /** Set the active session's agent mode (e.g. "auto-edit", "manual"). */
    setMode(mode: string): void;
    /** Stage text in the active composer prompt. */
    setPrompt(text: string): void;
    /** Start a new session tab in `projectId` (defaults to the active project) and focus it. */
    newSession(projectId?: string): Promise<void>;
    /** Scroll the transcript view to a tool call or message block by id. */
    scrollToToolCall(id: string): void;
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
  /** Small overlay rendered on the rail button (e.g. a sync indicator). */
  badge?: ComponentType<{ host: ModuleHost }>;
  /** Dynamic tooltip (a React hook, called during render). Receives the default title; returns the full title. */
  useTitle?: (host: ModuleHost, baseTitle: string) => string;
  component: ComponentType<{ host: ModuleHost }>;
}

export interface TabKindContribution {
  kind: string;
  /** Title override for the tab strip (defaults to `tab.title`). */
  title?: (tab: ModuleTab) => string;
  icon?: ComponentType<{ size?: number; tab: ModuleTab }>;
  component: ComponentType<{ tab: ModuleTab; host: ModuleHost }>;
}

/** A tool call as a tool card sees it. */
export interface ToolCardCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** True once the call's arguments have fully streamed in. */
  complete: boolean;
  /** True while the tool is executing (no result yet). */
  running: boolean;
  /** Final tool output; undefined until the call settles. */
  result?: { text: string; isError: boolean };
}

/**
 * Replaces the generic transcript row of matching tool calls with a module-owned card (e.g. an inline review).
 * The first contribution whose `match` returns true wins.
 */
export interface ToolCardContribution extends ContributionBase {
  id: string;
  match(call: Pick<ToolCardCall, "name" | "arguments">): boolean;
  component: ComponentType<{ host: ModuleHost; call: ToolCardCall }>;
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
  toolCards?: ToolCardContribution[];
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
