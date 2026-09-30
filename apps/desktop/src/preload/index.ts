import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
  IPC,
  type Bootstrap,
  type BridgeActionRequest,
  type BridgeActionResult,
  type BridgeMessage,
  type LinkedProject,
  type RpcExtensionUIResponse,
  type RpcResult,
  type SessionEventBatch,
  type SessionStatusUpdate,
  type StartSessionRequest,
  type StartSessionResult,
  type StudioApi,
  type StudioRpcCommand,
  type UiRequestMessage,
} from "@pi-studio/protocol";

const api: StudioApi = {
  bootstrap(): Promise<Bootstrap> {
    return ipcRenderer.invoke(IPC.bootstrap);
  },

  pickFolder(): Promise<string | null> {
    return ipcRenderer.invoke(IPC.pickFolder);
  },

  startSession(request: StartSessionRequest): Promise<StartSessionResult> {
    return ipcRenderer.invoke(IPC.startSession, request);
  },

  stopSession(key: string): Promise<void> {
    return ipcRenderer.invoke(IPC.stopSession, key);
  },

  rpc(key: string, command: StudioRpcCommand): Promise<RpcResult> {
    return ipcRenderer.invoke(IPC.rpc, key, command);
  },

  respondUi(key: string, response: RpcExtensionUIResponse): Promise<void> {
    return ipcRenderer.invoke(IPC.uiResponse, key, response);
  },

  bridgeAction(key: string, action: BridgeActionRequest): Promise<BridgeActionResult> {
    return ipcRenderer.invoke(IPC.bridgeAction, key, action);
  },

  setLinkedProjects(key: string, links: LinkedProject[]): Promise<void> {
    return ipcRenderer.invoke(IPC.setLinkedProjects, key, links);
  },

  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },

  onSessionEvents(listener: (batch: SessionEventBatch) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, batch: SessionEventBatch) => listener(batch);
    ipcRenderer.on(IPC.evtEvents, handler);
    return () => ipcRenderer.removeListener(IPC.evtEvents, handler);
  },

  onSessionStatus(listener: (update: SessionStatusUpdate) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, update: SessionStatusUpdate) => listener(update);
    ipcRenderer.on(IPC.evtStatus, handler);
    return () => ipcRenderer.removeListener(IPC.evtStatus, handler);
  },

  onUiRequest(listener: (message: UiRequestMessage) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, message: UiRequestMessage) => listener(message);
    ipcRenderer.on(IPC.evtUiRequest, handler);
    return () => ipcRenderer.removeListener(IPC.evtUiRequest, handler);
  },

  onBridgeMessage(listener: (message: BridgeMessage) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, message: BridgeMessage) => listener(message);
    ipcRenderer.on(IPC.evtBridge, handler);
    return () => ipcRenderer.removeListener(IPC.evtBridge, handler);
  },

  // Projects & Catalog
  getProjects() {
    return ipcRenderer.invoke(IPC.projectsList);
  },

  addProject(path: string, name?: string, color?: string) {
    return ipcRenderer.invoke(IPC.projectsAdd, { path, name, color });
  },

  updateProject(id: string, updates: any) {
    return ipcRenderer.invoke(IPC.projectsUpdate, { id, updates });
  },

  removeProject(id: string) {
    return ipcRenderer.invoke(IPC.projectsRemove, { id });
  },

  listAllSessions() {
    return ipcRenderer.invoke(IPC.sessionsListAll);
  },

  readSessionFile(sessionPath: string) {
    return ipcRenderer.invoke(IPC.sessionsReadFile, { path: sessionPath });
  },

  deleteSessionFile(sessionPath: string) {
    return ipcRenderer.invoke(IPC.sessionsDelete, { path: sessionPath });
  },

  checkTrust(path: string) {
    return ipcRenderer.invoke(IPC.trustCheck, { path });
  },

  setTrust(path: string, trusted: boolean) {
    return ipcRenderer.invoke(IPC.trustSet, { path, trusted });
  },

  // Git
  getGitStatus(cwd: string) {
    return ipcRenderer.invoke(IPC.gitStatus, { cwd });
  },
  stageFile(cwd: string, filePath: string) {
    return ipcRenderer.invoke(IPC.gitStage, { cwd, filePath });
  },
  unstageFile(cwd: string, filePath: string) {
    return ipcRenderer.invoke(IPC.gitUnstage, { cwd, filePath });
  },
  discardFile(cwd: string, filePath: string) {
    return ipcRenderer.invoke(IPC.gitDiscard, { cwd, filePath });
  },
  gitCommit(cwd: string, message: string, amend?: boolean) {
    return ipcRenderer.invoke(IPC.gitCommit, { cwd, message, amend });
  },
  getGitBranches(cwd: string) {
    return ipcRenderer.invoke(IPC.gitBranches, { cwd });
  },

  // Files
  listFiles(dirPath: string) {
    return ipcRenderer.invoke(IPC.filesList, { dirPath });
  },
  readFile(filePath: string) {
    return ipcRenderer.invoke(IPC.filesRead, { filePath });
  },
  runFile(filePath: string, cwd: string) {
    return ipcRenderer.invoke(IPC.filesRun, { filePath, cwd });
  },

  // Marketplace
  searchMarketplace(query?: string, kind?: string) {
    return ipcRenderer.invoke(IPC.marketplaceSearch, { query, kind });
  },
};

contextBridge.exposeInMainWorld("studio", api);
