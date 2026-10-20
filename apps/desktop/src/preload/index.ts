import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";
import {
  IPC,
  type Bootstrap,
  type CompactionSettings,
  type GhLocateResult,
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
  type SessionStartProgress,
  type StartSessionRequest,
  type StartSessionResult,
  type StudioApi,
  type SessionWorktree,
  type StudioRpcCommand,
  type SubagentLocateRequest,
  type UiRequestMessage,
  type UpdateProgress,
  type WorktreeRemoveOptions,
  type TidyWorktreeAction,
  type TidyWorktreeScanRequest,
} from "@hive/protocol";

const api: StudioApi = {
  bootstrap(): Promise<Bootstrap> {
    return ipcRenderer.invoke(IPC.bootstrap);
  },

  relocateGh(): Promise<GhLocateResult> {
    return ipcRenderer.invoke(IPC.ghRelocate);
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

  onSessionStartProgress(listener: (progress: SessionStartProgress) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, progress: SessionStartProgress) => listener(progress);
    ipcRenderer.on(IPC.evtStartProgress, handler);
    return () => ipcRenderer.removeListener(IPC.evtStartProgress, handler);
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

  addProject(path: string, name?: string, color?: string, icon?: string | null) {
    return ipcRenderer.invoke(IPC.projectsAdd, { path, name, color, icon });
  },

  updateProject(id: string, updates: any) {
    return ipcRenderer.invoke(IPC.projectsUpdate, { id, updates });
  },

  removeProject(id: string) {
    return ipcRenderer.invoke(IPC.projectsRemove, { id });
  },

  getLastOpenedProjectId(): Promise<string | undefined> {
    return ipcRenderer.invoke(IPC.projectsGetLastOpened);
  },

  setLastOpenedProjectId(id?: string): Promise<void> {
    return ipcRenderer.invoke(IPC.projectsSetLastOpened, { id });
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

  generateSessionTitle(cwd: string, prompt: string, model?: string, sessionPath?: string) {
    return ipcRenderer.invoke(IPC.sessionsGenerateTitle, { cwd, prompt, model, sessionPath });
  },

  pickStaleSessions(cwd: string, sessions: unknown[], model?: string) {
    return ipcRenderer.invoke(IPC.sessionsPickStale, { cwd, sessions, model });
  },

  worktreeStatus(worktree: SessionWorktree) {
    return ipcRenderer.invoke(IPC.worktreeStatus, { worktree });
  },

  worktreeRemove(worktree: SessionWorktree, options?: WorktreeRemoveOptions) {
    return ipcRenderer.invoke(IPC.worktreeRemove, { worktree, options });
  },

  worktreeMerge(worktree: SessionWorktree) {
    return ipcRenderer.invoke(IPC.worktreeMerge, { worktree });
  },

  worktreeConflictsStart(worktree: SessionWorktree) {
    return ipcRenderer.invoke(IPC.worktreeConflictsStart, { worktree });
  },
  worktreeConflictsResolve(worktree: SessionWorktree, resolutions: unknown) {
    return ipcRenderer.invoke(IPC.worktreeConflictsResolve, { worktree, resolutions });
  },
  worktreeConflictsAbort(worktree: SessionWorktree) {
    return ipcRenderer.invoke(IPC.worktreeConflictsAbort, { worktree });
  },
  worktreeConflictsAi(worktree: SessionWorktree, request: unknown) {
    return ipcRenderer.invoke(IPC.worktreeConflictsAi, { worktree, request });
  },
  worktreeRenameBranch(worktree: SessionWorktree, newTitle: string) {
    return ipcRenderer.invoke(IPC.worktreeRenameBranch, { worktree, newTitle });
  },

  worktreeTidyScan(request: TidyWorktreeScanRequest) {
    return ipcRenderer.invoke(IPC.worktreeTidyScan, { request });
  },

  worktreeTidyApply(projectPath: string, actions: TidyWorktreeAction[]) {
    return ipcRenderer.invoke(IPC.worktreeTidyApply, { projectPath, actions });
  },

  checkTrust(path: string) {
    return ipcRenderer.invoke(IPC.trustCheck, { path });
  },

  setTrust(path: string, trusted: boolean) {
    return ipcRenderer.invoke(IPC.trustSet, { path, trusted });
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
  saveAttachment(name: string, data: ArrayBuffer) {
    return ipcRenderer.invoke(IPC.filesSaveAttachment, { name, data });
  },
  showItemInFolder(filePath: string) {
    return ipcRenderer.invoke(IPC.filesShowInFolder, { filePath });
  },
  pickFiles(options?: { allowImagesOnly?: boolean }) {
    return ipcRenderer.invoke(IPC.pickFiles, options);
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
  refreshOAuth(providerId: string) {
    return ipcRenderer.invoke(IPC.authRefresh, { providerId });
  },

  // Updater
  checkForUpdates() {
    return ipcRenderer.invoke(IPC.updaterCheck);
  },
  checkPiUpdate() {
    return ipcRenderer.invoke(IPC.piUpdateCheck);
  },
  applyPiUpdate(target?: string) {
    return ipcRenderer.invoke(IPC.piUpdateApply, { target });
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

  // AI Registry, MCP, and Subagent output
  getSessionRegistry(key?: string) {
    return ipcRenderer.invoke(IPC.aiSessionRegistry, { key });
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

  // Checkpoints
  listCheckpoints(sessionId: string) {
    return ipcRenderer.invoke(IPC.checkpointsList, sessionId);
  },
  getCheckpointDiffInfo(turnId: string) {
    return ipcRenderer.invoke(IPC.checkpointsDiffInfo, turnId);
  },
  getCheckpointDiffText(turnId: string, filePath?: string) {
    return ipcRenderer.invoke(IPC.checkpointsDiffText, turnId, filePath);
  },
  restoreCheckpoint(turnId: string, mode: "turn" | "rewind") {
    return ipcRenderer.invoke(IPC.checkpointsRestore, turnId, mode);
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
