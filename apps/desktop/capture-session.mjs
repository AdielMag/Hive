import electron from "electron";
const { app, BrowserWindow } = electron;
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

process.env.PI_STUDIO_PROJECT = "C:\\Users\\Adiel\\Blog";

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

  await import("./out/main/index.js");
  await new Promise((r) => setTimeout(r, 3000));

  const wins = BrowserWindow.getAllWindows();
  const targetWin = wins[0] || win;

  const image = await targetWin.webContents.capturePage();
  writeFileSync(resolve(__dirname, "../../session-ui.png"), image.toPNG());
  console.log("Screenshot written to session-ui.png");

  app.quit();
});
