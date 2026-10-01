/**
 * AppContext: the single object that owns every main-process service. IPC modules receive it instead of
 * reaching for module-level globals, which keeps each domain independently testable and replaceable.
 */
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, type BrowserWindow } from "electron";
import type { PiLocateResult } from "@pi-studio/protocol";
import { GuiStore } from "./store/index.ts";
import { SessionCatalogService } from "./services/catalog.ts";
import { MainSessionManager } from "./services/session-manager.ts";
import { AuthService } from "./services/auth.ts";
import { MarketplaceService } from "./services/marketplace.ts";
import { AppUpdaterService } from "./services/updater.ts";
import { ModelsService } from "./services/models.ts";
import { QuotaService } from "./services/quota/index.ts";
import { UsageService } from "./services/usage.ts";
import { PiInstallService } from "./services/pi-install.ts";
import { terminalManager, type TerminalManager } from "./services/terminal.ts";

export interface AppContext {
  pi: PiLocateResult;
  piInstall: PiInstallService;
  testMode: boolean;
  getWindow(): BrowserWindow | null;
  guiStore: GuiStore;
  catalog: SessionCatalogService | null;
  sessions: MainSessionManager | null;
  auth: AuthService | null;
  marketplace: MarketplaceService;
  updater: AppUpdaterService;
  models: ModelsService;
  quota: QuotaService;
  usage: UsageService;
  terminals: TerminalManager;
}

export function createAppContext(getWindow: () => BrowserWindow | null): AppContext {
  const userData = app.getPath("userData");
  const piInstall = new PiInstallService(userData);
  const pi = piInstall.locate();
  const testMode = process.env.PI_STUDIO_TEST_MODE === "1";
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
    marketplace: new MarketplaceService(),
    updater: new AppUpdaterService(),
    models: new ModelsService(),
    quota: new QuotaService(info),
    usage: new UsageService(join(userData, "pi-studio", "usage-cache.json")),
    terminals: terminalManager,
  };
}
