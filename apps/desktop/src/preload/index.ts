import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";
import {
  IPC,
  type Bootstrap,
  type CompactionSettings,
  type PiLocateResult,
  type ModuleEventMessage,
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
  type SubagentLocateRequest,
  type UiRequestMessage,
  type UpdateProgress,
} from "@hive/protocol";

const api: StudioApi = {
  bootstrap(): Promise<Bootstrap> {
    return ipcRenderer.invoke(IPC.bootstrap);
  },

  relocatePi(): Promise<PiLocateResult> {
    return ipcRenderer.invoke(IPC.piRelocate);
  },

  choosePiLocation(): Promise<PiLocateResult | null> {
    return ipcRenderer.invoke(IPC.piChoose);
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

  bridgeEmit(key: string, topic: string, data: unknown): Promise<void> {
    return ipcRenderer.invoke(IPC.bridgeEmit, key, topic, data);
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

  updateSessionMeta(sessionPath: string, updates: any) {
    return ipcRenderer.invoke(IPC.sessionsUpdateMeta, { path: sessionPath, updates });
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
  stageAll(cwd: string) {
    return ipcRenderer.invoke(IPC.gitStageAll, { cwd });
  },
  unstageFile(cwd: string, filePath: string) {
    return ipcRenderer.invoke(IPC.gitUnstage, { cwd, filePath });
  },
  unstageAll(cwd: string) {
    return ipcRenderer.invoke(IPC.gitUnstageAll, { cwd });
  },
  discardFile(cwd: string, filePath: string) {
    return ipcRenderer.invoke(IPC.gitDiscard, { cwd, filePath });
  },
  discardAll(cwd: string) {
    return ipcRenderer.invoke(IPC.gitDiscardAll, { cwd });
  },
  gitCommit(cwd: string, message: string, amend?: boolean) {
    return ipcRenderer.invoke(IPC.gitCommit, { cwd, message, amend });
  },
  getGitBranches(cwd: string) {
    return ipcRenderer.invoke(IPC.gitBranches, { cwd });
  },
  gitCheckout(cwd: string, branch: string) {
    return ipcRenderer.invoke(IPC.gitCheckout, { cwd, branch });
  },
  gitCreateBranch(cwd: string, branch: string) {
    return ipcRenderer.invoke(IPC.gitCreateBranch, { cwd, branch });
  },
  gitDeleteBranch(cwd: string, branch: string, force?: boolean) {
    return ipcRenderer.invoke(IPC.gitDeleteBranch, { cwd, branch, force });
  },
  getGitLog(cwd: string, maxCount?: number) {
    return ipcRenderer.invoke(IPC.gitLog, { cwd, maxCount });
  },
  getGitBranchDetails(cwd: string) {
    return ipcRenderer.invoke(IPC.gitBranchDetails, { cwd });
  },
  getGitGraph(cwd: string, maxCount?: number) {
    return ipcRenderer.invoke(IPC.gitGraph, { cwd, maxCount });
  },
  getGitDiff(cwd: string, options?: { staged?: boolean; filePath?: string }) {
    return ipcRenderer.invoke(IPC.gitDiff, { cwd, options });
  },
  generateCommitMessage(cwd: string, model?: string) {
    return ipcRenderer.invoke(IPC.gitGenerateCommitMessage, { cwd, model });
  },
  gitFetch(cwd: string) {
    return ipcRenderer.invoke(IPC.gitFetch, { cwd });
  },
  gitPull(cwd: string) {
    return ipcRenderer.invoke(IPC.gitPull, { cwd });
  },
  gitPush(cwd: string) {
    return ipcRenderer.invoke(IPC.gitPush, { cwd });
  },

  // Files
  listFiles(dirPath: string) {
    return ipcRenderer.invoke(IPC.filesList, { dirPath });
  },
  readFile(filePath: string) {
    return ipcRenderer.invoke(IPC.filesRead, { filePath });
  },
  readMediaFile(filePath: string) {
    return ipcRenderer.invoke(IPC.filesReadMedia, { filePath });
  },
  pickFiles(options?: { allowImagesOnly?: boolean }) {
    return ipcRenderer.invoke(IPC.pickFiles, options);
  },
  runFile(filePath: string, cwd: string) {
    return ipcRenderer.invoke(IPC.filesRun, { filePath, cwd });
  },

  // Window Controls
  minimizeWindow() {
    return ipcRenderer.invoke(IPC.windowMinimize);
  },
  maximizeWindow() {
    return ipcRenderer.invoke(IPC.windowMaximize);
  },
  closeWindow() {
    return ipcRenderer.invoke(IPC.windowClose);
  },
  isWindowMaximized() {
    return ipcRenderer.invoke(IPC.windowIsMaximized);
  },
  onWindowMaximizedChange(listener: (isMaximized: boolean) => void) {
    const handler = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => listener(isMaximized);
    ipcRenderer.on(IPC.evtWindowMaximized, handler);
    return () => ipcRenderer.removeListener(IPC.evtWindowMaximized, handler);
  },

  // Auth
  getAuthAccounts() {
    return ipcRenderer.invoke(IPC.authGetAccounts);
  },
  saveApiKey(providerId: string, apiKey: string) {
    return ipcRenderer.invoke(IPC.authSaveApiKey, { providerId, apiKey });
  },
  logoutAccount(providerId: string) {
    return ipcRenderer.invoke(IPC.authLogout, { providerId });
  },
  loginOAuth(providerId: string) {
    return ipcRenderer.invoke(IPC.authLoginOAuth, { providerId });
  },

  // Updater
  checkForUpdates() {
    return ipcRenderer.invoke(IPC.updaterCheck);
  },
  checkPiUpdate() {
    return ipcRenderer.invoke(IPC.piUpdateCheck);
  },
  applyPiUpdate() {
    return ipcRenderer.invoke(IPC.piUpdateApply);
  },
  applyUpdate(downloadUrl?: string) {
    return ipcRenderer.invoke(IPC.updaterApply, { downloadUrl });
  },
  onUpdateProgress(listener: (progress: UpdateProgress) => void) {
    const handler = (_event: Electron.IpcRendererEvent, progress: UpdateProgress) => listener(progress);
    ipcRenderer.on(IPC.evtUpdaterProgress, handler);
    return () => ipcRenderer.removeListener(IPC.evtUpdaterProgress, handler);
  },

  // Models
  getModelsCatalog() {
    return ipcRenderer.invoke(IPC.modelsGetCatalog);
  },
  saveEnabledModels(enabledModels: string[]) {
    return ipcRenderer.invoke(IPC.modelsSaveEnabled, { enabledModels });
  },
  getCompactionSettings() {
    return ipcRenderer.invoke(IPC.settingsGetCompaction);
  },
  saveCompactionSettings(settings: CompactionSettings) {
    return ipcRenderer.invoke(IPC.settingsSaveCompaction, settings);
  },

  // Insights
  getQuota(force?: boolean) {
    return ipcRenderer.invoke(IPC.quotaGet, { force });
  },
  getUsage(force?: boolean) {
    return ipcRenderer.invoke(IPC.usageGet, { force });
  },
  generateUsageInsights(summaryText: string, model?: string) {
    return ipcRenderer.invoke(IPC.aiGenerateUsageInsights, { summaryText, model });
  },

  // AI Registry, MCP, and Subagent output
  getSessionRegistry(key?: string) {
    return ipcRenderer.invoke(IPC.aiSessionRegistry, { key });
  },
  getMcpCatalog() {
    return ipcRenderer.invoke(IPC.aiMcpCatalog);
  },
  getContextFiles(cwd?: string) {
    return ipcRenderer.invoke(IPC.aiContextFiles, { cwd });
  },
  locateSubagentOutput(req: SubagentLocateRequest) {
    return ipcRenderer.invoke(IPC.subagentLocate, req);
  },
  readSubagentOutput(path: string, fromOffset?: number) {
    return ipcRenderer.invoke(IPC.subagentRead, { path, fromOffset });
  },

  // Shell
  openExternal(url: string, options?: { external?: boolean }) {
    return ipcRenderer.invoke(IPC.openExternal, url, options);
  },
  openSystemBrowser(url: string) {
    return ipcRenderer.invoke(IPC.openSystemBrowser, url);
  },
  onOpenLink(listener: (data: { url: string; title?: string }) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, data: { url: string; title?: string }) => listener(data);
    ipcRenderer.on(IPC.evtOpenLink, handler);
    return () => ipcRenderer.removeListener(IPC.evtOpenLink, handler);
  },
  zoom(direction: "in" | "out" | "reset") {
    const level = direction === "reset" ? 0 : webFrame.getZoomLevel() + (direction === "in" ? 0.5 : -0.5);
    webFrame.setZoomLevel(Math.max(-3, Math.min(4, level)));
  },

  modules: {
    list: () => ipcRenderer.invoke(IPC.modulesList),
    setEnabled: (moduleId: string, enabled: boolean) => ipcRenderer.invoke(IPC.modulesSetEnabled, moduleId, enabled),
    setEnabledSet: (moduleIds: string[]) => ipcRenderer.invoke(IPC.modulesSetEnabledSet, moduleIds),
    markOnboarded: () => ipcRenderer.invoke(IPC.modulesMarkOnboarded),
    invoke: (moduleId: string, method: string, ...args: unknown[]) => ipcRenderer.invoke(IPC.modulesInvoke, moduleId, method, ...args),
    on<T = unknown>(moduleId: string, event: string, listener: (payload: T) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, msg: ModuleEventMessage) => {
        if (msg?.moduleId === moduleId && msg.event === event) listener(msg.payload as T);
      };
      ipcRenderer.on(IPC.evtModuleEvent, handler);
      return () => ipcRenderer.removeListener(IPC.evtModuleEvent, handler);
    },
  },
};

contextBridge.exposeInMainWorld("studio", api);
