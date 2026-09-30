import { Menu, app, BrowserWindow, dialog, ipcMain, shell } from "electron";
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
import { GuiStore } from "./store/index.ts";
import { SessionCatalogService } from "./catalog.ts";
import {
  getGitStatus,
  getGitBranches,
  stageFile,
  unstageFile,
  discardFile,
  gitCommit,
} from "./git.ts";
import { listDirectory, readFileContent, runWithInterpreter } from "./files.ts";
import { MarketplaceService, type MarketplaceSourceKind } from "./marketplace.ts";

let mainWindow: BrowserWindow | null = null;
let sessionManager: MainSessionManager | null = null;
let guiStore: GuiStore | null = null;
let catalogService: SessionCatalogService | null = null;
const marketplaceService = new MarketplaceService();

const piResult = locatePi();
const testMode = process.env.PI_STUDIO_TEST_MODE === "1";
const testProviderPath = testMode
  ? resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../packages/test-provider/index.ts")
  : undefined;

function createWindow(): void {
  const preloadPath = join(__dirname, "../preload/index.js");

  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#090a0d",
    title: "Pi Studio",
    titleBarStyle: "hidden",
    titleBarOverlay: process.platform === "win32" ? { color: "#0d0f14", symbolColor: "#9aa4b2", height: 36 } : false,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  if (piResult.ok) {
    guiStore = new GuiStore(app.getPath("userData"));
    catalogService = new SessionCatalogService(piResult.info.packageRoot, guiStore);
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

  if (process.env.PI_STUDIO_CAPTURE === "1") {
    mainWindow.webContents.on("did-finish-load", async () => {
      await new Promise((r) => setTimeout(r, 2500));
      const img = await mainWindow?.webContents.capturePage();
      if (img) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(resolve(__dirname, "../../current-ui.png"), img.toPNG());
        console.log("Captured real screenshot to current-ui.png");
      }
      app.quit();
    });
  }
}

// Register IPC handlers
ipcMain.handle(IPC.bootstrap, async (): Promise<Bootstrap> => {
  return {
    pi: piResult,
    appVersion: app.getVersion(),
    platform: process.platform,
    initialProjectPath: process.env.PI_STUDIO_PROJECT ?? null,
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

// Projects & Catalog Handlers
ipcMain.handle(IPC.projectsList, async () => {
  return guiStore?.getProjects() ?? [];
});

ipcMain.handle(IPC.projectsAdd, async (_event, { path: dirPath, name, color }) => {
  if (!guiStore) throw new Error("Store not initialized");
  return guiStore.addProject(dirPath, name, color);
});

ipcMain.handle(IPC.projectsUpdate, async (_event, { id, updates }) => {
  if (!guiStore) throw new Error("Store not initialized");
  return guiStore.updateProject(id, updates);
});

ipcMain.handle(IPC.projectsRemove, async (_event, { id }) => {
  if (!guiStore) return false;
  return guiStore.removeProject(id);
});

ipcMain.handle(IPC.sessionsListAll, async () => {
  if (!catalogService) return [];
  return catalogService.listAll();
});

ipcMain.handle(IPC.sessionsReadFile, async (_event, { path: sessionPath }) => {
  if (!catalogService) throw new Error("Catalog service not available");
  return catalogService.readSessionFile(sessionPath);
});

ipcMain.handle(IPC.sessionsDelete, async (_event, { path: sessionPath }) => {
  if (!catalogService) return false;
  return catalogService.deleteSession(sessionPath);
});

ipcMain.handle(IPC.trustCheck, async (_event, { path: dirPath }) => {
  if (!catalogService) return { hasTrustResources: false, trusted: true };
  return catalogService.checkTrust(dirPath);
});

ipcMain.handle(IPC.trustSet, async (_event, { path: dirPath, trusted }) => {
  if (catalogService) await catalogService.setTrust(dirPath, trusted);
});

// Git IPC Handlers
ipcMain.handle(IPC.gitStatus, async (_event, { cwd }) => {
  return getGitStatus(cwd);
});
ipcMain.handle(IPC.gitBranches, async (_event, { cwd }) => {
  return getGitBranches(cwd);
});
ipcMain.handle(IPC.gitStage, async (_event, { cwd, filePath }) => {
  return stageFile(cwd, filePath);
});
ipcMain.handle(IPC.gitUnstage, async (_event, { cwd, filePath }) => {
  return unstageFile(cwd, filePath);
});
ipcMain.handle(IPC.gitDiscard, async (_event, { cwd, filePath }) => {
  return discardFile(cwd, filePath);
});
ipcMain.handle(IPC.gitCommit, async (_event, { cwd, message, amend }) => {
  return gitCommit(cwd, message, amend);
});

// Files IPC Handlers
ipcMain.handle(IPC.filesList, async (_event, { dirPath }) => {
  return listDirectory(dirPath);
});
ipcMain.handle(IPC.filesRead, async (_event, { filePath }) => {
  return readFileContent(filePath);
});
ipcMain.handle(IPC.filesRun, async (_event, { filePath, cwd }) => {
  return runWithInterpreter(filePath, cwd);
});

// Marketplace IPC Handlers
ipcMain.handle(IPC.marketplaceSearch, async (_event, { query, kind }) => {
  return marketplaceService.search(query, kind as MarketplaceSourceKind);
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
