import { app, dialog, shell } from "electron";
import { IPC, type Bootstrap } from "@pi-studio/protocol";
import type { AppContext } from "../context.ts";
import { isSafeExternalUrl } from "../window.ts";
import { handle } from "./util.ts";

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"];
const TEXT_EXT = ["ts", "tsx", "js", "jsx", "json", "md", "txt", "css", "html", "py", "rs", "go", "sh", "yaml", "yml", "cs", "java", "kt", "c", "cpp", "h"];

export function registerAppIpc(ctx: AppContext): void {
  handle(IPC.bootstrap, (): Bootstrap => ({
    pi: ctx.pi,
    appVersion: app.getVersion(),
    platform: process.platform,
    initialProjectPath: process.env.PI_STUDIO_PROJECT ?? null,
    testMode: ctx.testMode,
  }));

  handle(IPC.pickFolder, async () => {
    const win = ctx.getWindow();
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"], title: "Select project folder" });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });

  handle(IPC.pickFiles, async (options?: { allowImagesOnly?: boolean }) => {
    const win = ctx.getWindow();
    if (!win) return [];
    const filters = options?.allowImagesOnly
      ? [{ name: "Images", extensions: IMAGE_EXT }]
      : [
          { name: "All Supported", extensions: [...IMAGE_EXT, ...TEXT_EXT] },
          { name: "Images", extensions: IMAGE_EXT },
          { name: "All Files", extensions: ["*"] },
        ];
    const r = await dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
      title: "Select files or images to attach",
      filters,
    });
    return r.canceled ? [] : r.filePaths;
  });

  handle(IPC.openExternal, async (url: string) => {
    if (isSafeExternalUrl(url)) await shell.openExternal(url);
  });

  // Window controls
  handle(IPC.windowMinimize, () => ctx.getWindow()?.minimize());
  handle(IPC.windowMaximize, () => {
    const win = ctx.getWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  handle(IPC.windowClose, () => ctx.getWindow()?.close());
  handle(IPC.windowIsMaximized, () => ctx.getWindow()?.isMaximized() ?? false);
}
