import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";
import {
  IPC,
  type Bootstrap,
  type CompactionSettings,
  type LibrarySetFieldRequest,
  type PiLocateResult,
  type PlanFeedbackPayload,
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

  // Marketplace
  searchMarketplace(query?: string, kind?: string) {
    return ipcRenderer.invoke(IPC.marketplaceSearch, { query, kind });
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
  applyUpdate(downloadUrl?: string) {
    return ipcRenderer.invoke(IPC.updaterApply, { downloadUrl });
  },
  onUpdateProgress(listener: (progress: UpdateProgress) => void) {
    const handler = (_event: Electron.IpcRendererEvent, progress: UpdateProgress) => listener(progress);
    ipcRenderer.on(IPC.evtUpdaterProgress, handler);
    return () => ipcRenderer.removeListener(IPC.evtUpdaterProgress, handler);
  },

  // Terminal
  terminalCreate(options?: { cwd?: string; shell?: string; cols?: number; rows?: number }) {
    return ipcRenderer.invoke(IPC.terminalCreate, options);
  },
  terminalWrite(id: string, data: string) {
    return ipcRenderer.invoke(IPC.terminalWrite, { id, data });
  },
  terminalResize(id: string, cols: number, rows: number) {
    return ipcRenderer.invoke(IPC.terminalResize, { id, cols, rows });
  },
  terminalKill(id: string) {
    return ipcRenderer.invoke(IPC.terminalKill, { id });
  },
  terminalList() {
    return ipcRenderer.invoke(IPC.terminalList);
  },
  onTerminalData(listener: (event: { id: string; data: string }) => void) {
    const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }) => listener(payload);
    ipcRenderer.on(IPC.evtTerminalData, handler);
    return () => ipcRenderer.removeListener(IPC.evtTerminalData, handler);
  },
  onTerminalExit(listener: (event: { id: string; exitCode: number }) => void) {
    const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; exitCode: number }) => listener(payload);
    ipcRenderer.on(IPC.evtTerminalExit, handler);
    return () => ipcRenderer.removeListener(IPC.evtTerminalExit, handler);
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

  // Skills & agents library
  listLibrary(cwd?: string) {
    return ipcRenderer.invoke(IPC.libraryList, { cwd });
  },
  setLibraryField(request: LibrarySetFieldRequest) {
    return ipcRenderer.invoke(IPC.librarySetField, request);
  },
  revealLibraryPath(path: string, cwd?: string) {
    return ipcRenderer.invoke(IPC.libraryReveal, { path, cwd });
  },
  openLibraryPath(path: string, cwd?: string) {
    return ipcRenderer.invoke(IPC.libraryOpenPath, { path, cwd });
  },

  // AI Registry, MCP, and Subagent output
  getSessionRegistry(key?: string) {
    return ipcRenderer.invoke(IPC.aiSessionRegistry, { key });
  },
  getMcpCatalog() {
    return ipcRenderer.invoke(IPC.aiMcpCatalog);
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
  onOpenBrowserTab(listener: (data: { url: string; title?: string }) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, data: { url: string; title?: string }) => listener(data);
    ipcRenderer.on(IPC.evtOpenBrowserTab, handler);
    return () => ipcRenderer.removeListener(IPC.evtOpenBrowserTab, handler);
  },
  zoom(direction: "in" | "out" | "reset") {
    const level = direction === "reset" ? 0 : webFrame.getZoomLevel() + (direction === "in" ? 0.5 : -0.5);
    webFrame.setZoomLevel(Math.max(-3, Math.min(4, level)));
  },

  // Plan Previewer
  getPlanData(filePath: string) {
    return ipcRenderer.invoke(IPC.planGet, filePath);
  },
  submitPlanFeedback(payload: PlanFeedbackPayload) {
    return ipcRenderer.invoke(IPC.planSubmitFeedback, payload);
  },
  savePlanContent(filePath: string, content: string) {
    return ipcRenderer.invoke(IPC.planSave, filePath, content);
  },
  onOpenPlanTab(listener: (data: { filePath: string; context?: string }) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, data: { filePath: string; context?: string }) => listener(data);
    ipcRenderer.on(IPC.evtOpenPlanTab, handler);
    return () => ipcRenderer.removeListener(IPC.evtOpenPlanTab, handler);
  },
  onPlanUpdated(listener: (data: { filePath: string; fileVersion: number; content?: string }) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, data: { filePath: string; fileVersion: number; content?: string }) => listener(data);
    ipcRenderer.on(IPC.evtPlanUpdated, handler);
    return () => ipcRenderer.removeListener(IPC.evtPlanUpdated, handler);
  },
};

contextBridge.exposeInMainWorld("studio", api);
