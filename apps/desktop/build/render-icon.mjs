// Rasterizes build/icon.svg -> build/icon.png (1024x1024) using Electron. Run: electron build/render-icon.mjs
import electron from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const { app, BrowserWindow } = electron;
const dir = fileURLToPath(new URL(".", import.meta.url));
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.whenReady().then(async () => {
  const svg = readFileSync(dir + "icon.svg", "utf8");
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, useContentSize: true });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", '<svg width="1024" height="1024" ')}</body></html>`));
  await new Promise((r) => setTimeout(r, 400));
  const img = (await win.webContents.capturePage()).resize({ width: 1024, height: 1024 });
  writeFileSync(dir + "icon.png", img.toPNG());
  app.quit();
});
