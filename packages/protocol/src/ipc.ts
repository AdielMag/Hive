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
import type { ProjectDefaults, ProjectEntry, SessionCatalogItem } from "./projects.ts";
import type { QuotaSnapshot, UsageReport } from "./insights.ts";
import type {
  McpServerInfo,
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

export interface Bootstrap {
  pi: PiLocateResult;
  appVersion: string;
  platform: string;
  /** Folder to open at startup (env PI_STUDIO_PROJECT, else last used). */
  initialProjectPath: string | null;
  testMode: boolean;
}

export type SessionPhase = "starting" | "ready" | "stopping" | "exited" | "crashed";

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
}

export interface StartSessionResult {
  key: string;
  projectPath: string;
}

export type RpcResult = { ok: true; data?: unknown } | { ok: false; error: string };

export type BridgeActionRequest = DistributiveOmit<BridgeAction, "id">;
export type BridgeActionResult = { ok: true; data?: unknown } | { ok: false; error: string };

/** Channel names. Keep in one place so preload and main cannot drift. */
export const IPC = {
  bootstrap: "studio:bootstrap",
  piRelocate: "studio:pi-relocate",
  piChoose: "studio:pi-choose",
  pickFolder: "studio:pick-folder",
  startSession: "session:start",
  stopSession: "session:stop",
  rpc: "session:rpc",
  uiResponse: "session:ui-response",
  bridgeAction: "session:bridge-action",
  setLinkedProjects: "session:set-linked-projects",
  evtEvents: "session:events",
  evtStatus: "session:status",
  evtUiRequest: "session:ui-request",
  evtBridge: "session:bridge",
  // Projects & Catalog
  projectsList: "projects:list",
  projectsAdd: "projects:add",
  projectsUpdate: "projects:update",
  projectsRemove: "projects:remove",
  sessionsListAll: "sessions:list-all",
  sessionsReadFile: "sessions:read-file",
  sessionsDelete: "sessions:delete",
  trustCheck: "trust:check",
  trustSet: "trust:set",
  // Git
  gitStatus: "git:status",
  gitStage: "git:stage",
  gitStageAll: "git:stage-all",
  gitUnstage: "git:unstage",
  gitUnstageAll: "git:unstage-all",
  gitDiscard: "git:discard",
  gitDiscardAll: "git:discard-all",
  gitCommit: "git:commit",
  gitBranches: "git:branches",
  gitCheckout: "git:checkout",
  gitCreateBranch: "git:create-branch",
  gitDeleteBranch: "git:delete-branch",
  gitLog: "git:log",
  gitDiff: "git:diff",
  gitGenerateCommitMessage: "git:generate-commit-message",
  // Settings & Compaction
  settingsGetCompaction: "settings:get-compaction",
  settingsSaveCompaction: "settings:save-compaction",
  // Files
  filesList: "files:list",
  filesRead: "files:read",
  filesReadMedia: "files:read-media",
  filesRun: "files:run",
  pickFiles: "studio:pick-files",
  // Marketplace
  marketplaceSearch: "marketplace:search",
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
  // Updater
  updaterCheck: "updater:check",
  updaterApply: "updater:apply",
  // Terminal
  terminalCreate: "terminal:create",
  terminalWrite: "terminal:write",
  terminalResize: "terminal:resize",
  terminalKill: "terminal:kill",
  terminalList: "terminal:list",
  evtTerminalData: "terminal:data",
  evtTerminalExit: "terminal:exit",
  // Models
  modelsGetCatalog: "models:get-catalog",
  modelsSaveEnabled: "models:save-enabled",
  // Insights
  quotaGet: "insights:quota",
  usageGet: "insights:usage",
  // Shell
  openExternal: "shell:open-external",
  // Skills & agents library
  libraryList: "library:list",
  librarySetField: "library:set-field",
  libraryReveal: "library:reveal",
  libraryOpenPath: "library:open-path",
  // AI Registry, MCP, and Subagent output
  aiSessionRegistry: "ai:session-registry",
  aiMcpCatalog: "ai:mcp-catalog",
  subagentLocate: "subagents:locate",
  subagentRead: "subagents:read",
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

export interface ModelCatalogItem {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
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
}

export interface StudioApi {
  bootstrap(): Promise<Bootstrap>;
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
  setLinkedProjects(key: string, links: LinkedProject[]): Promise<void>;
  /** Absolute path of a dropped/picked File (Electron webUtils). */
  getPathForFile(file: File): string;
  onSessionEvents(listener: (batch: SessionEventBatch) => void): () => void;
  onSessionStatus(listener: (update: SessionStatusUpdate) => void): () => void;
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
  listAllSessions(): Promise<SessionCatalogItem[]>;
  readSessionFile(sessionPath: string): Promise<{ entries: SessionEntry[]; leafId: string | null }>;
  deleteSessionFile(sessionPath: string): Promise<boolean>;
  checkTrust(path: string): Promise<{ hasTrustResources: boolean; trusted: boolean }>;
  setTrust(path: string, trusted: boolean): Promise<void>;

  // Git operations
  getGitStatus(cwd: string): Promise<any>;
  stageFile(cwd: string, filePath: string): Promise<void>;
  stageAll(cwd: string): Promise<void>;
  unstageFile(cwd: string, filePath: string): Promise<void>;
  unstageAll(cwd: string): Promise<void>;
  discardFile(cwd: string, filePath: string): Promise<void>;
  discardAll(cwd: string): Promise<void>;
  gitCommit(cwd: string, message: string, amend?: boolean): Promise<string>;
  getGitBranches(cwd: string): Promise<string[]>;
  gitCheckout(cwd: string, branch: string): Promise<string>;
  gitCreateBranch(cwd: string, branch: string): Promise<string>;
  gitDeleteBranch(cwd: string, branch: string, force?: boolean): Promise<string>;
  getGitLog(cwd: string, maxCount?: number): Promise<Array<{ hash: string; author: string; relativeDate: string; message: string }>>;
  getGitDiff(cwd: string, options?: { staged?: boolean; filePath?: string }): Promise<string>;
  generateCommitMessage(cwd: string, model?: string): Promise<string>;
  getCompactionSettings(): Promise<CompactionSettings>;
  saveCompactionSettings(settings: CompactionSettings): Promise<{ success: boolean; modelsUpdated: number }>;

  // File operations
  listFiles(dirPath: string): Promise<any[]>;
  readFile(filePath: string): Promise<any>;
  readMediaFile(filePath: string): Promise<{ data: string; mimeType: string; size: number; name: string }>;
  pickFiles(options?: { allowImagesOnly?: boolean }): Promise<string[]>;
  runFile(filePath: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;

  // Marketplace operations
  searchMarketplace(query?: string, kind?: string): Promise<any[]>;

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

  // Updater
  checkForUpdates(): Promise<any>;
  applyUpdate(downloadUrl?: string): Promise<{ success: boolean; message: string }>;

  // Terminal
  terminalCreate(options?: { cwd?: string; shell?: string; cols?: number; rows?: number }): Promise<{ id: string; shell: string; cwd: string }>;
  terminalWrite(id: string, data: string): Promise<void>;
  terminalResize(id: string, cols: number, rows: number): Promise<void>;
  terminalKill(id: string): Promise<void>;
  terminalList(): Promise<{ id: string; shell: string; cwd: string }[]>;
  onTerminalData(listener: (event: { id: string; data: string }) => void): () => void;
  onTerminalExit(listener: (event: { id: string; exitCode: number }) => void): () => void;

  // Models
  getModelsCatalog(): Promise<ModelsCatalogResponse>;
  saveEnabledModels(enabledModels: string[]): Promise<{ success: boolean }>;

  // Insights
  /** Subscription limits for every connected account. `force` bypasses the short-lived cache. */
  getQuota(force?: boolean): Promise<QuotaSnapshot>;
  /** Aggregated token/cost usage parsed from Pi session files. */
  getUsage(force?: boolean): Promise<UsageReport>;

  // Skills & agents library
  listLibrary(cwd?: string): Promise<LibrarySnapshot>;
  setLibraryField(request: LibrarySetFieldRequest): Promise<LibrarySetFieldResult>;
  /** Show a library file in the OS file manager. */
  revealLibraryPath(path: string, cwd?: string): Promise<void>;
  /** Open a library file (or skill folder) with the OS default application. */
  openLibraryPath(path: string, cwd?: string): Promise<{ ok: boolean; error?: string }>;

  // AI Registry, MCP, and Subagent output
  getSessionRegistry(key?: string): Promise<SessionRegistry | null>;
  getMcpCatalog(): Promise<McpServerInfo[]>;
  locateSubagentOutput(req: SubagentLocateRequest): Promise<SubagentOutputRef | null>;
  readSubagentOutput(path: string, fromOffset?: number): Promise<SubagentOutputChunk>;

  // Shell
  openExternal(url: string): Promise<void>;
  /** Page zoom (Ctrl +/-/0). */
  zoom(direction: "in" | "out" | "reset"): void;
}
