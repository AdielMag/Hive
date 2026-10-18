/**
 * Main <-> renderer contract. The renderer never touches Node; everything goes through the
 * narrow `window.studio` API exposed by the preload script. Main validates every request.
 */
import type {
  JsonAgentSessionEvent,
  RpcCommand,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse,
  RpcResponse,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
export type { SessionStats } from "@earendil-works/pi-coding-agent";
export type { Model } from "@earendil-works/pi-ai";
import type { BridgeAction, BridgeToStudio, LinkedProject } from "./bridge.ts";
import type { ProjectDefaults, ProjectEntry, SessionCatalogItem, SessionMetaEntry, SessionWorktree } from "./projects.ts";
import type { ModulesSnapshot, SetModulesEnabledResult } from "@hive/module-sdk";
import type {
  ContextFileInfo,
  SessionRegistry,
  SubagentLocateRequest,
  SubagentOutputChunk,
  SubagentOutputRef,
} from "./registry.ts";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A Pi RPC command without the correlation id (main assigns ids). */
export type StudioRpcCommand = DistributiveOmit<RpcCommand, "id">;
export type StudioRpcCommandType = StudioRpcCommand["type"];

type SuccessResponse = Extract<RpcResponse, { success: true }>;
/** The `data` payload Pi returns for a given command type (undefined when it returns none). */
export type RpcDataFor<T extends StudioRpcCommandType> =
  Extract<SuccessResponse, { command: T }> extends { data: infer D } ? D : undefined;

/** Stdout records that are RPC-only (not part of the shared JSON event stream types). */
export type RpcOnlyEvent =
  | { type: "bash_execution_update"; id?: string; delta: string }
  | { type: "extension_error"; extensionPath: string; event: string; error: string };

/** Every event record Pi streams on stdout (responses and extension UI requests excluded). */
export type PiStreamEvent = JsonAgentSessionEvent | RpcOnlyEvent;

export type { RpcExtensionUIRequest, RpcExtensionUIResponse };

export type PiSupport = "supported" | "untested-newer" | "too-old";

export interface PiInstallInfo {
  version: string;
  /** Node executable used to run Pi. */
  nodePath: string;
  /** Absolute path to Pi's CLI entry (dist/bundle/cli.js). */
  cliPath: string;
  /** Absolute path to the @earendil-works/pi-coding-agent package root. */
  packageRoot: string;
  /** How it was found. */
  source: "env" | "path" | "known-location";
  support: PiSupport;
  minVersion: string;
  testedMaxVersion: string;
}

export type PiLocateResult =
  | { ok: true; info: PiInstallInfo }
  | { ok: false; error: string; searched: string[] };

export type GhLocateResult =
  | { ok: true; version: string; path: string }
  | { ok: false; error: string; searched: string[] };

export interface Bootstrap {
  pi: PiLocateResult;
  gh: GhLocateResult;
  appVersion: string;
  platform: string;
  /** Folder to open at startup (env HIVE_PROJECT, else last used). */
  initialProjectPath: string | null;
  testMode: boolean;
}

export type SessionPhase = "starting" | "ready" | "stopping" | "exited" | "crashed";

/** Progress of an in-app update install (main → renderer). */
export interface UpdateProgress {
  phase: "downloading" | "launching" | "browser" | "error";
  /** Bytes downloaded so far. */
  received: number;
  /** Total bytes, when the server reports a Content-Length. */
  total?: number;
  message?: string;
}

/** A Pi extension (npm package under Pi's agent dir) that Hive keeps up to date alongside Pi. */
export interface PiExtensionUpdate {
  name: string;
  hasUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
}

export interface PiUpdateInfo {
  /** True when Pi itself OR any entry in `extensions` has an update. */
  hasUpdate: boolean;
  /** True when the Pi CLI itself has an update. */
  cliHasUpdate?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
  extensions?: PiExtensionUpdate[];
}

export interface SessionStatusUpdate {
  key: string;
  phase: SessionPhase;
  pid?: number;
  exitCode?: number | null;
  error?: string;
  /** Last lines of Pi's stderr, for diagnostics. */
  stderrTail?: string;
}

export interface SessionEventBatch {
  key: string;
  events: PiStreamEvent[];
}

export interface UiRequestMessage {
  key: string;
  request: RpcExtensionUIRequest;
}

export interface BridgeMessage {
  key: string;
  message: BridgeToStudio;
}

export interface StartSessionRequest {
  projectPath: string;
  /** Resume this session file; omit to start a new session. */
  sessionPath?: string;
  /** Run a new session in its own git worktree (default true; set false to work in the main tree). Ignored on resume. */
  useWorktree?: boolean;
  /** Branch to fork the worktree from (default: the main tree's current HEAD). */
  baseBranch?: string;
  /** Session title; used to name the worktree branch/folder. */
  title?: string;
  /** Caller-chosen id echoed in `session:start-progress` events while this start is in flight. */
  startId?: string;
}

/** Startup step of an in-flight `startSession` call (keyed by the request's `startId`). */
export interface SessionStartProgress {
  startId: string;
  step: "worktree" | "spawn";
}

export interface StartSessionResult {
  key: string;
  projectPath: string;
  /** Present when the session runs in a git worktree (its cwd is `worktree.worktreePath`). */
  worktree?: SessionWorktree;
}

export interface WorktreeStatus {
  /** False when the worktree folder is gone. */
  exists: boolean;
  /** Commits on the session branch not in the base branch. */
  ahead: number;
  /** Commits on the base branch not in the session branch. */
  behind: number;
  /** Uncommitted (modified/untracked) files in the worktree. */
  dirty: number;
}

export interface WorktreeRemoveOptions {
  /** Remove even with uncommitted changes and delete an unmerged branch. */
  force?: boolean;
  /** Also delete the session branch (default true). */
  deleteBranch?: boolean;
}

export type WorktreeRemoveResult = { ok: true; branchDeleted: boolean } | { ok: false; error: string };

export type WorktreeRenameResult = { ok: true; branch: string } | { ok: false; error: string };

export type WorktreeMergeResult =
  | { ok: true; alreadyUpToDate: boolean; /** Uncommitted files left behind in the worktree (not merged). */ uncommitted: number }
  | {
      ok: false;
      reason: "dirty-main" | "base-not-checked-out" | "conflict" | "error";
      error: string;
      /** Conflicting files (reason "conflict"; the merge is aborted). */
      conflicts?: string[];
    };

export type RpcResult = { ok: true; data?: unknown } | { ok: false; error: string };

export type BridgeActionRequest = DistributiveOmit<BridgeAction, "id">;
export type BridgeActionResult = { ok: true; data?: unknown } | { ok: false; error: string };

/** Channel names. Keep in one place so preload and main cannot drift. */
export const IPC = {
  bootstrap: "studio:bootstrap",
  piRelocate: "studio:pi-relocate",
  piChoose: "studio:pi-choose",
  ghRelocate: "studio:gh-relocate",
  pickFolder: "studio:pick-folder",
  startSession: "session:start",
  stopSession: "session:stop",
  rpc: "session:rpc",
  uiResponse: "session:ui-response",
  bridgeAction: "session:bridge-action",
  bridgeEmit: "session:bridge-emit",
  setLinkedProjects: "session:set-linked-projects",
  evtEvents: "session:events",
  evtStatus: "session:status",
  evtStartProgress: "session:start-progress",
  evtUiRequest: "session:ui-request",
  evtBridge: "session:bridge",
  // Projects & Catalog
  projectsList: "projects:list",
  projectsAdd: "projects:add",
  projectsUpdate: "projects:update",
  projectsRemove: "projects:remove",
  projectsGetLastOpened: "projects:get-last-opened",
  projectsSetLastOpened: "projects:set-last-opened",
  sessionsListAll: "sessions:list-all",
  sessionsReadFile: "sessions:read-file",
  sessionsDelete: "sessions:delete",
  sessionsUpdateMeta: "sessions:update-meta",
  sessionsGenerateTitle: "sessions:generate-title",
  // Session worktrees
  worktreeStatus: "worktree:status",
  worktreeRemove: "worktree:remove",
  worktreeMerge: "worktree:merge",
  worktreeRenameBranch: "worktree:renameBranch",
  trustCheck: "trust:check",
  trustSet: "trust:set",
  // Settings & Compaction
  settingsGetCompaction: "settings:get-compaction",
  settingsSaveCompaction: "settings:save-compaction",
  // Files
  filesList: "files:list",
  filesRead: "files:read",
  filesReadMedia: "files:read-media",
  filesShowInFolder: "files:show-in-folder",
  pickFiles: "studio:pick-files",
  filesSaveAttachment: "files:save-attachment",
  // Window controls
  windowMinimize: "window:minimize",
  windowMaximize: "window:maximize",
  windowClose: "window:close",
  windowIsMaximized: "window:is-maximized",
  evtWindowMaximized: "window:maximized-change",
  // Auth
  authGetAccounts: "auth:get-accounts",
  authSaveApiKey: "auth:save-api-key",
  authLogout: "auth:logout",
  authLoginOAuth: "auth:login-oauth",
  authRefresh: "auth:refresh",
  // Updater
  updaterCheck: "updater:check",
  updaterApply: "updater:apply",
  evtUpdaterProgress: "updater:progress",
  piUpdateCheck: "pi-updater:check",
  piUpdateApply: "pi-updater:apply",
  // Models
  modelsGetCatalog: "models:get-catalog",
  modelsSaveEnabled: "models:save-enabled",
  // Insights
  // Shell
  openExternal: "shell:open-external",
  openSystemBrowser: "shell:open-system-browser",
  evtOpenLink: "app:open-link",
  // Modules (generic bridge for every installable feature module)
  modulesList: "modules:list",
  modulesSetEnabled: "modules:set-enabled",
  modulesSetEnabledSet: "modules:set-enabled-set",
  modulesMarkOnboarded: "modules:mark-onboarded",
  modulesInvoke: "modules:invoke",
  evtModuleEvent: "modules:event",
  // AI Registry, MCP, and Subagent output
  aiSessionRegistry: "ai:session-registry",
  aiContextFiles: "ai:context-files",
  subagentLocate: "subagents:locate",
  subagentRead: "subagents:read",
  // Checkpoints
  checkpointsList: "checkpoints:list",
  checkpointsDiffInfo: "checkpoints:diff-info",
  checkpointsDiffText: "checkpoints:diff-text",
  checkpointsRestore: "checkpoints:restore",
} as const;

export type LibraryKind = "skill" | "agent";
export type LibraryScope = "project" | "global" | "builtin";
export type LibraryFieldValue = string | number | boolean | null;

export interface LibrarySection {
  /** Heading level (1-6); 0 for the untitled intro ("Overview"). */
  level: number;
  title: string;
  /** Unique within the entry. */
  slug: string;
  /** Markdown content under the heading (heading line excluded). */
  content: string;
}

export interface LibraryEntry {
  /** Absolute file path, or `builtin:<name>` for built-in agents. */
  id: string;
  kind: LibraryKind;
  scope: LibraryScope;
  /** Absolute file path (null for built-ins). */
  path: string | null;
  /** Discovery root the file was found under (null for built-ins). */
  sourceDir: string | null;
  /** Effective name: frontmatter `name`, else folder (SKILL.md) or file name. */
  name: string;
  displayName?: string;
  description?: string;
  color?: string;
  frontmatter: Record<string, unknown>;
  /** Full file source. */
  raw: string;
  /** Markdown after the frontmatter. */
  body: string;
  sections: LibrarySection[];
  mtimeMs: number;
  parseError?: string;
  /** Non-fatal problems (e.g. a skill without a description is not loaded by Pi). */
  warnings: string[];
  /** Built-ins cannot be edited. */
  readOnly: boolean;
  /** A higher-priority entry with the same kind + name wins over this one. */
  shadowed: boolean;
  /** Path of the entry that wins over this one. */
  overriddenBy?: string;
  /** Agent file that replaces a pi-subagents built-in of the same name. */
  overridesBuiltin?: boolean;
  /** Skills only: files next to SKILL.md (relative, `/`-separated). */
  supportingFiles?: string[];
  supportingFilesTruncated?: boolean;
}

export interface LibraryRootInfo {
  dir: string;
  kind: LibraryKind;
  scope: Exclude<LibraryScope, "builtin">;
  exists: boolean;
}

export interface LibrarySnapshot {
  cwd: string | null;
  roots: LibraryRootInfo[];
  entries: LibraryEntry[];
  scannedAt: number;
  scanMs: number;
}

export interface LibrarySetFieldRequest {
  /** Project the file belongs to (decides which project roots are writable). */
  cwd?: string;
  path: string;
  key: string;
  /** null removes the key. */
  value: LibraryFieldValue;
  /** Reject with "conflict" when the file's mtime differs (edited elsewhere). */
  expectedMtimeMs?: number;
}

export type LibrarySetFieldResult =
  | { ok: true; entry: LibraryEntry }
  | { ok: false; code: "conflict" | "not-allowed" | "io" | "invalid"; error: string };

export interface LibraryDeleteRequest {
  cwd?: string;
  path: string;
}

export type LibraryDeleteResult =
  | { ok: true }
  | { ok: false; error: string };

export interface ModelCatalogItem {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input?: string[];
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
}

export interface ModelsCatalogResponse {
  models: ModelCatalogItem[];
  enabledModels: string[];
  defaultModel?: string;
  defaultProvider?: string;
}

/** API exposed on `window.studio` by the preload script. */
/**
 * Auto-compaction expressed relative to each model's context window. Pi only understands absolute
 * token counts, so Studio converts these into per-model `compaction.modelOverrides` in settings.json.
 */
export interface CompactionSettings {
  enabled: boolean;
  /** Compact once context fills this % of the model's window (Pi: reserveTokens = window * (100 - %)). */
  triggerPercent: number;
  /** Keep this % of the model's window as recent, un-summarized history (Pi: keepRecentTokens). */
  keepRecentPercent: number;
  /**
   * Ceiling (tokens) on the recent history kept verbatim, so a big window doesn't keep a big raw
   * tail (5% of 1M = 50K of tool output). 0 = no cap. Missing = default (20K).
   */
  keepRecentMaxTokens?: number;
}

export interface StudioApi {
  bootstrap(): Promise<Bootstrap>;
  /** Search for GitHub CLI (`gh`) again (fresh PATH). */
  relocateGh(): Promise<GhLocateResult>;
  /** Search for Pi again (fresh PATH). On success the app restarts itself to start using it. */
  relocatePi(): Promise<PiLocateResult>;
  /** Let the user pick Pi's location. Null if cancelled; on success the app restarts. */
  choosePiLocation(): Promise<PiLocateResult | null>;
  pickFolder(): Promise<string | null>;
  startSession(request: StartSessionRequest): Promise<StartSessionResult>;
  stopSession(key: string): Promise<void>;
  rpc(key: string, command: StudioRpcCommand): Promise<RpcResult>;
  respondUi(key: string, response: RpcExtensionUIResponse): Promise<void>;
  bridgeAction(key: string, action: BridgeActionRequest): Promise<BridgeActionResult>;
  /** Publish on the session's `pi.events` bus (e.g. answer a question form on `BRIDGE_TOPICS.fromGui`). */
  bridgeEmit(key: string, topic: string, data: unknown): Promise<void>;
  setLinkedProjects(key: string, links: LinkedProject[]): Promise<void>;
  /** Absolute path of a dropped/picked File (Electron webUtils). */
  getPathForFile(file: File): string;
  onSessionEvents(listener: (batch: SessionEventBatch) => void): () => void;
  onSessionStatus(listener: (update: SessionStatusUpdate) => void): () => void;
  onSessionStartProgress(listener: (progress: SessionStartProgress) => void): () => void;
  onUiRequest(listener: (message: UiRequestMessage) => void): () => void;
  onBridgeMessage(listener: (message: BridgeMessage) => void): () => void;

  // Projects & Catalog APIs
  getProjects(): Promise<ProjectEntry[]>;
  addProject(path: string, name?: string, color?: string): Promise<ProjectEntry>;
  updateProject(
    id: string,
    updates: {
      name?: string;
      color?: string;
      links?: LinkedProject[];
      defaults?: ProjectDefaults;
      pinned?: boolean;
      hidden?: boolean;
    },
  ): Promise<ProjectEntry>;
  removeProject(id: string): Promise<boolean>;
  getLastOpenedProjectId(): Promise<string | undefined>;
  setLastOpenedProjectId(id?: string): Promise<void>;
  listAllSessions(): Promise<SessionCatalogItem[]>;
  readSessionFile(sessionPath: string): Promise<{ entries: SessionEntry[]; leafId: string | null }>;
  deleteSessionFile(sessionPath: string): Promise<boolean>;
  /** Patch Studio-side session metadata (title / archived / pinned). */
  updateSessionMeta(sessionPath: string, updates: Partial<SessionMetaEntry>): Promise<SessionMetaEntry>;
  /** One-shot LLM call that names a session from its first prompt. Resolves "" on failure. */
  generateSessionTitle(cwd: string, prompt: string, model?: string, sessionPath?: string): Promise<string>;
  /** Ahead/behind (vs the base branch) and dirty count of a session worktree. */
  worktreeStatus(worktree: SessionWorktree): Promise<WorktreeStatus>;
  /** Remove a session worktree (and by default its branch). */
  worktreeRemove(worktree: SessionWorktree, options?: WorktreeRemoveOptions): Promise<WorktreeRemoveResult>;
  /** Merge the session branch into its base branch in the main tree. Aborts cleanly on conflicts / a dirty main tree. */
  worktreeMerge(worktree: SessionWorktree): Promise<WorktreeMergeResult>;
  /** Rename the session worktree's branch (e.g. to a descriptive name based on the user's initial request). */
  worktreeRenameBranch(worktree: SessionWorktree, newTitle: string): Promise<WorktreeRenameResult>;
  checkTrust(path: string): Promise<{ hasTrustResources: boolean; trusted: boolean }>;
  setTrust(path: string, trusted: boolean): Promise<void>;

  getCompactionSettings(): Promise<CompactionSettings>;
  saveCompactionSettings(settings: CompactionSettings): Promise<{ success: boolean; modelsUpdated: number }>;

  // File operations
  listFiles(dirPath: string): Promise<any[]>;
  readFile(filePath: string): Promise<any>;
  readMediaFile(filePath: string): Promise<{ data: string; mimeType: string; size: number; name: string }>;
  /** Persist pasted/dropped bytes (e.g. a video) to a temp file so the agent can read it by path. */
  saveAttachment(name: string, data: ArrayBuffer): Promise<{ path: string; size: number }>;
  showItemInFolder(filePath: string): Promise<void>;
  pickFiles(options?: { allowImagesOnly?: boolean }): Promise<string[]>;
  // Marketplace operations

  // Window Controls
  minimizeWindow(): Promise<void>;
  maximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  isWindowMaximized(): Promise<boolean>;
  onWindowMaximizedChange(listener: (isMaximized: boolean) => void): () => void;

  // Auth & Accounts
  getAuthAccounts(): Promise<any[]>;
  saveApiKey(providerId: string, apiKey: string): Promise<void>;
  logoutAccount(providerId: string): Promise<void>;
  loginOAuth(providerId: string): Promise<{ success: boolean; error?: string }>;
  /** Silently refresh an OAuth token (no browser). `success: false` means the user must reconnect. */
  refreshOAuth(providerId: string): Promise<{ success: boolean; error?: string }>;

  // Updater
  checkForUpdates(): Promise<any>;
  applyUpdate(downloadUrl?: string): Promise<{ success: boolean; message: string }>;
  onUpdateProgress(listener: (progress: UpdateProgress) => void): () => void;
  checkPiUpdate(): Promise<PiUpdateInfo>;
  applyPiUpdate(target?: string): Promise<{ success: boolean; message: string }>;


  // Models
  getModelsCatalog(): Promise<ModelsCatalogResponse>;
  saveEnabledModels(enabledModels: string[]): Promise<{ success: boolean }>;

  // Insights
  /** Subscription limits for every connected account. `force` bypasses the short-lived cache. */
  /** Aggregated token/cost usage parsed from Pi session files. */


  // AI Registry, MCP, and Subagent output
  getSessionRegistry(key?: string): Promise<SessionRegistry | null>;
  /** Sizes of AGENTS.md / SYSTEM.md style files that feed the system prompt for `cwd`. */
  getContextFiles(cwd?: string): Promise<ContextFileInfo[]>;
  locateSubagentOutput(req: SubagentLocateRequest): Promise<SubagentOutputRef | null>;
  readSubagentOutput(path: string, fromOffset?: number): Promise<SubagentOutputChunk>;

  // Shell
  openExternal(url: string, options?: { external?: boolean }): Promise<void>;
  openSystemBrowser(url: string): Promise<void>;
  onOpenLink(listener: (data: { url: string; title?: string }) => void): () => void;
  /** Page zoom (Ctrl +/-/0). */
  zoom(direction: "in" | "out" | "reset"): void;

  // Checkpoints
  listCheckpoints(sessionId: string): Promise<any[]>;
  getCheckpointDiffInfo(turnId: string): Promise<any>;
  getCheckpointDiffText(turnId: string, filePath?: string): Promise<string>;
  restoreCheckpoint(turnId: string, mode: "turn" | "rewind"): Promise<any>;

  /** Installable feature modules. Module code talks to its main half only through `invoke` / `on`. */
  modules: ModulesApi;
}

/** Main -> renderer push of a module event (`ctx.ipc.emit` in a main module). */
export interface ModuleEventMessage {
  moduleId: string;
  event: string;
  payload: unknown;
}

export interface ModulesApi {
  list(): Promise<ModulesSnapshot>;
  /** Turns a module on/off (requirements / dependents follow). Resolves with the resulting enabled set. */
  setEnabled(moduleId: string, enabled: boolean): Promise<SetModulesEnabledResult>;
  /** Replaces the whole enabled set (first-run presets). Requirements are added automatically. */
  setEnabledSet(moduleIds: string[]): Promise<SetModulesEnabledResult>;
  markOnboarded(): Promise<void>;
  /** Calls a method the module registered with `ctx.ipc.handle`. Rejects while the module is disabled. */
  invoke<T = unknown>(moduleId: string, method: string, ...args: unknown[]): Promise<T>;
  on<T = unknown>(moduleId: string, event: string, listener: (payload: T) => void): () => void;
}
