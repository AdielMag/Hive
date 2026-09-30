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
import type { BridgeAction, BridgeToStudio, LinkedProject } from "./bridge.ts";
import type { ProjectDefaults, ProjectEntry, SessionCatalogItem } from "./projects.ts";

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
  gitUnstage: "git:unstage",
  gitDiscard: "git:discard",
  gitCommit: "git:commit",
  gitBranches: "git:branches",
  // Files
  filesList: "files:list",
  filesRead: "files:read",
  filesRun: "files:run",
  // Marketplace
  marketplaceSearch: "marketplace:search",
} as const;

/** API exposed on `window.studio` by the preload script. */
export interface StudioApi {
  bootstrap(): Promise<Bootstrap>;
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
  unstageFile(cwd: string, filePath: string): Promise<void>;
  discardFile(cwd: string, filePath: string): Promise<void>;
  gitCommit(cwd: string, message: string, amend?: boolean): Promise<string>;
  getGitBranches(cwd: string): Promise<string[]>;

  // File operations
  listFiles(dirPath: string): Promise<any[]>;
  readFile(filePath: string): Promise<any>;
  runFile(filePath: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;

  // Marketplace operations
  searchMarketplace(query?: string, kind?: string): Promise<any[]>;
}
