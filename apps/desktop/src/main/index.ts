/**
 * Pi Studio main process entry: owns app lifecycle only. Services live in ./services, IPC wiring in
 * ./ipc, window creation in ./window.ts.
 */
import { app, BrowserWindow } from "electron";
import { createAppContext, type AppContext } from "./context.ts";
import { registerIpc } from "./ipc/index.ts";
import { createMainWindow } from "./window.ts";

// Isolated profile for tests / screenshot automation.
if (process.env.PI_STUDIO_USER_DATA) app.setPath("userData", process.env.PI_STUDIO_USER_DATA);

let mainWindow: BrowserWindow | null = null;
let ctx: AppContext | null = null;

// Only one Pi Studio instance: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Re-launching after installing Pi should just work, even though this instance is still running.
    if (ctx && !ctx.pi.ok && ctx.piInstall.relocate().ok) {
      app.relaunch();
      app.exit(0);
      return;
    }
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    ctx = createAppContext(() => mainWindow);
    registerIpc(ctx);
    // Give models added since the last save their percentage-based compaction values.
    try {
      ctx.models.reapplyCompaction();
    } catch (err) {
      console.error("Failed to re-apply compaction settings", err);
    }
    mainWindow = createMainWindow();
    mainWindow.on("closed", () => {
      mainWindow = null;
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let shuttingDown = false;
app.on("will-quit", (event) => {
  if (shuttingDown || !ctx) return;
  shuttingDown = true;
  ctx.terminals.disposeAll();
  const sessions = ctx.sessions;
  if (!sessions) return;
  event.preventDefault();
  // Give Pi processes a bounded window to exit cleanly, then quit regardless.
  void Promise.race([sessions.stopAll(), new Promise((r) => setTimeout(r, 3000))]).finally(() => app.quit());
});
