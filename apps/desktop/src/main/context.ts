/**
 * AppContext: the single object that owns every main-process service. IPC modules receive it instead of
 * reaching for module-level globals, which keeps each domain independently testable and replaceable.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, type BrowserWindow } from "electron";
import type { PiLocateResult } from "@hive/protocol";
import { ensureHiveDataDir } from "./migrate-legacy.ts";
import { GuiStore } from "./store/index.ts";
import { SessionCatalogService } from "./services/catalog.ts";
import { MainSessionManager } from "./services/session-manager.ts";
import { AuthService } from "./services/auth.ts";
import { AppUpdaterService } from "./services/updater.ts";
import { ModelsService } from "./services/models.ts";
import { PiInstallService } from "./services/pi-install.ts";
import { IPC } from "@hive/protocol";
import { MainModuleHost } from "./modules/host.ts";
import { MAIN_MODULE_LOADERS, MODULE_MANIFESTS } from "./modules.generated.ts";
import { moduleRootPath, piAgentDir } from "./paths.ts";

export interface AppContext {
  pi: PiLocateResult;
  piInstall: PiInstallService;
  testMode: boolean;
  getWindow(): BrowserWindow | null;
  guiStore: GuiStore;
  catalog: SessionCatalogService | null;
  sessions: MainSessionManager | null;
  auth: AuthService | null;
  updater: AppUpdaterService;
  models: ModelsService;
  /** Installable feature modules (enabled set, lifecycle, scoped IPC). Started in index.ts. */
  modules: MainModuleHost;
}

export function createAppContext(getWindow: () => BrowserWindow | null): AppContext {
  const userData = app.getPath("userData");
  // Must run before any service touches `<userData>/hive` so legacy Pi Studio data is migrated first.
  const hiveDataDir = ensureHiveDataDir(userData);
  const piInstall = new PiInstallService(userData);
  const pi = piInstall.locate();
  const testMode = (process.env.HIVE_TEST_MODE ?? process.env.PI_STUDIO_TEST_MODE) === "1";
  const testProviderPath = testMode
    ? resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../packages/test-provider/index.ts")
    : undefined;
  const guiStore = new GuiStore(userData);
  const info = pi.ok ? pi.info : null;

  return {
    pi,
    piInstall,
    testMode,
    getWindow,
    guiStore,
    catalog: info ? new SessionCatalogService(info.packageRoot, guiStore) : null,
    sessions: info ? new MainSessionManager(info, getWindow, testProviderPath) : null,
    auth: info ? new AuthService(info.packageRoot) : null,
    updater: new AppUpdaterService(),
    models: new ModelsService(undefined, hiveDataDir),
    modules: new MainModuleHost({
      manifests: MODULE_MANIFESTS,
      loaders: MAIN_MODULE_LOADERS,
      hiveDataDir,
      piAgentDir,
      pi: () => info,
      moduleRoot: moduleRootPath,
      // Test runs must never touch the real ~/.pi/agent.
      manageAgentAssets: !testMode || !!process.env.PI_CODING_AGENT_DIR,
      send: (msg) => getWindow()?.webContents.send(IPC.evtModuleEvent, msg),
    }),
  };
}
