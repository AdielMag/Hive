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
};

contextBridge.exposeInMainWorld("studio", api);
