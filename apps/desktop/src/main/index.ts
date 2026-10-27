/**
 * Hive main process entry: owns app lifecycle only. Services live in ./services, IPC wiring in
 * ./ipc, window creation in ./window.ts.
 */
import { app, BrowserWindow } from "electron";
import { createAppContext, type AppContext } from "./context.ts";
import { registerIpc } from "./ipc/index.ts";
import { createMainWindow } from "./window.ts";
import { migrateUserDataDir } from "./migrate-legacy.ts";
import { appendToProcessPath } from "./paths.ts";
import { listOrphans } from "./services/worktrees.ts";
import { cleanOldAttachments } from "./services/files.ts";

/** Best effort, log only: session worktrees git knows about that no session references (e.g. left by a crash). */
async function logOrphanWorktrees(c: AppContext): Promise<void> {
  if (!c.catalog) return;
  const known = (await c.catalog.listAll()).flatMap((s) => (s.worktree ? [s.worktree.worktreePath] : []));
  for (const project of c.guiStore.getProjects()) {
    for (const orphan of await listOrphans(project.path, known)) {
      console.warn(`[worktrees] orphan worktree ${orphan.worktreePath}${orphan.branch ? ` (${orphan.branch})` : ""} in ${project.path}`);
    }
  }
}

// Migrate legacy userData if needed before touching userData or stores.
migrateUserDataDir(app);

// Isolated profile for tests / screenshot automation.
const customUserData = process.env.HIVE_USER_DATA ?? process.env.PI_STUDIO_USER_DATA;
if (customUserData) app.setPath("userData", customUserData);

let mainWindow: BrowserWindow | null = null;
let ctx: AppContext | null = null;

// Only one Hive instance: a second launch focuses the existing window.
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
    // Enabled modules only: a disabled module is never imported and starts no services. CLI shims of
    // enabled modules live in the managed bin dir, appended to PATH so Pi sessions and terminals find them.
    appendToProcessPath(ctx.modules.binDir);
    cleanOldAttachments();
    void ctx.modules.start().catch((err) => console.error("Failed to start modules", err));
    void logOrphanWorktrees(ctx).catch((err) => console.warn("[worktrees] orphan scan failed", err));
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
  const sessions = ctx.sessions;
  event.preventDefault();
  // Give modules and Pi processes a bounded window to exit cleanly, then quit regardless.
  const work = Promise.all([ctx.modules.disposeAll(), sessions ? sessions.stopAll() : Promise.resolve()]);
  void Promise.race([work, new Promise((r) => setTimeout(r, 4000))]).finally(() => app.quit());
});
