import electron from "electron";
const { app, BrowserWindow } = electron;
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

process.env.PI_STUDIO_PROJECT = "C:\\Users\\Adiel\\Blog";

await import("./out/main/index.js");

app.whenReady().then(async () => {
  const wins = BrowserWindow.getAllWindows();
  const targetWin = wins[0];
  if (targetWin) {
    targetWin.webContents.on("console-message", (_event, _level, message) => {
      console.log("[Renderer Log]", message);
    });
    // Wait until renderer finishes init or timeout
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const isInit = await targetWin.webContents.executeJavaScript(
        "Boolean(window.__SESSION_STORE_INIT_DONE || !document.querySelector('.starting-pi') && document.body.innerText.includes('Pi Studio'))"
      ).catch(() => false);
      if (isInit) break;
    }
    const image = await targetWin.webContents.capturePage();
    writeFileSync(resolve(__dirname, "../../session-ui.png"), image.toPNG());
    console.log("Screenshot written to session-ui.png");
  }
  process.exit(0);
});
