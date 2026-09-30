import electron from "electron";
const { app, BrowserWindow } = electron;
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    show: false,
    backgroundColor: "#090a0d",
    webPreferences: {
      preload: resolve(__dirname, "out/preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadFile(resolve(__dirname, "out/renderer/index.html"));
  await new Promise((r) => setTimeout(r, 2000));

  const image = await win.webContents.capturePage();
  writeFileSync(resolve(__dirname, "../../current-ui.png"), image.toPNG());
  console.log("Screenshot written to current-ui.png");

  app.quit();
});
