/** Main BrowserWindow creation: frameless shell, safe external links, renderer diagnostics. */
import { BrowserWindow, Menu, app } from "electron";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { IPC } from "@hive/protocol";

/**
 * Directory of the bundled main script (out/main). Derived explicitly: the main bundle is ESM, where
 * `__dirname` doesn't exist, and electron-vite's injected shim can land inside another module's scope
 * (v0.5.0 shipped that way and crashed with "__dirname is not defined" before any window opened).
 */
const mainDir = dirname(fileURLToPath(import.meta.url));

export function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:";
  } catch {
    return false;
  }
}

export function createMainWindow(): BrowserWindow {
  const preloadCjs = join(mainDir, "../preload/index.cjs");
  const preloadPath = existsSync(preloadCjs) ? preloadCjs : join(mainDir, "../preload/index.js");

  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: "#0c0d12",
    title: "Hive",
    // macOS keeps its native traffic lights inset into our custom title bar; elsewhere we draw our own.
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 14, y: 12 } }
      : { frame: false }),
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
      webviewTag: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.on("maximize", () => win.webContents.send(IPC.evtWindowMaximized, true));
  win.on("unmaximize", () => win.webContents.send(IPC.evtWindowMaximized, false));

  // Enforce strict sandboxing on all attached webviews
  win.webContents.on("will-attach-webview", (_event, webPreferences, _params) => {
    delete (webPreferences as any).preload;
    delete (webPreferences as any).preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });

  // Intercept window.open from within webviews so target="_blank" links open as new Hive browser tabs
  win.webContents.on("did-attach-webview", (_event, guestWebContents) => {
    guestWebContents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) {
        win.webContents.send(IPC.evtOpenBrowserTab, { url });
      }
      return { action: "deny" };
    });
    guestWebContents.on("will-navigate", (event, navigationUrl) => {
      if (!isSafeExternalUrl(navigationUrl)) {
        event.preventDefault();
      }
    });
  });

  // External links clicked inside the app open in Hive's integrated browser by default!
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      win.webContents.send(IPC.evtOpenBrowserTab, { url });
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) {
        win.webContents.send(IPC.evtOpenBrowserTab, { url });
      }
    }
  });

  win.webContents.on("console-message", (details) => {
    const { level, message, lineNumber, sourceId } = details as unknown as {
      level: string;
      message: string;
      lineNumber: number;
      sourceId: string;
    };
    if (level === "warning" || level === "error") {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${lineNumber})`);
    }
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error(`[renderer] process gone: ${details.reason} (exit ${details.exitCode})`);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(mainDir, "../renderer/index.html"));
  }

  // Dev aid: HIVE_CAPTURE=<file.png> writes a screenshot after load and quits.
  const capture = process.env.HIVE_CAPTURE ?? process.env.PI_STUDIO_CAPTURE;
  if (capture) {
    win.webContents.once("did-finish-load", async () => {
      win.show();
      const delay = Number(process.env.HIVE_CAPTURE_DELAY ?? process.env.PI_STUDIO_CAPTURE_DELAY ?? 6000);
      const script = process.env.HIVE_CAPTURE_SCRIPT ?? process.env.PI_STUDIO_CAPTURE_SCRIPT;
      if (script) {
        await new Promise((r) => setTimeout(r, delay / 2));
        await win.webContents.executeJavaScript(script).catch((e) => console.error("[capture] script failed", e));
      }
      await new Promise((r) => setTimeout(r, script ? delay / 2 : delay));
      const img = await win.webContents.capturePage();
      writeFileSync(capture === "1" ? join(process.cwd(), "capture.png") : capture, img.toPNG());
      app.quit();
    });
  }

  return win;
}
