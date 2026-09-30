import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { locatePi } from "@pi-studio/pi-adapter/node";
import {
  IPC,
  type Bootstrap,
  type BridgeActionRequest,
  type LinkedProject,
  type RpcExtensionUIResponse,
  type StartSessionRequest,
  type StudioRpcCommand,
} from "@pi-studio/protocol";
import { MainSessionManager } from "./session-manager.ts";

let mainWindow: BrowserWindow | null = null;
let sessionManager: MainSessionManager | null = null;

const piResult = locatePi();
const testMode = process.env.PI_STUDIO_TEST_MODE === "1";
const testProviderPath = testMode
  ? resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../packages/test-provider/index.ts")
  : undefined;

function createWindow(): void {
  const preloadPath = join(__dirname, "../preload/index.js");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#16181d",
    title: "Pi Studio",
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  if (piResult.ok) {
    sessionManager = new MainSessionManager(piResult.info, () => mainWindow, testProviderPath);
  }

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// Register IPC handlers
ipcMain.handle(IPC.bootstrap, async (): Promise<Bootstrap> => {
  return {
    pi: piResult,
    appVersion: app.getVersion(),
    platform: process.platform,
    initialProjectPath: process.env.PI_STUDIO_PROJECT ?? process.cwd(),
    testMode,
  };
});

ipcMain.handle(IPC.pickFolder, async (): Promise<string | null> => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select project folder",
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.handle(IPC.startSession, async (_event, req: StartSessionRequest) => {
  if (!sessionManager) throw new Error("Pi CLI not available");
  return sessionManager.startSession(req);
});

ipcMain.handle(IPC.stopSession, async (_event, key: string) => {
  return sessionManager?.stopSession(key);
});

ipcMain.handle(IPC.rpc, async (_event, key: string, cmd: StudioRpcCommand) => {
  if (!sessionManager) return { ok: false, error: "Pi CLI not available" };
  return sessionManager.executeRpc(key, cmd);
});

ipcMain.handle(IPC.uiResponse, async (_event, key: string, res: RpcExtensionUIResponse) => {
  return sessionManager?.respondUi(key, res);
});

ipcMain.handle(IPC.bridgeAction, async (_event, key: string, action: BridgeActionRequest) => {
  if (!sessionManager) return { ok: false, error: "Pi CLI not available" };
  return sessionManager.executeBridgeAction(key, action);
});

ipcMain.handle(IPC.setLinkedProjects, async (_event, key: string, links: LinkedProject[]) => {
  return sessionManager?.setLinkedProjects(key, links);
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", async (event) => {
  if (sessionManager) {
    event.preventDefault();
    await sessionManager.stopAll();
    sessionManager = null;
    app.quit();
  }
});
