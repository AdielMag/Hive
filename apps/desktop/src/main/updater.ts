import { app, shell } from "electron";
import { compareVersions } from "@pi-studio/pi-adapter";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  notes?: string;
}

export class AppUpdaterService {
  private repo = "AdielMag/pi-studio";

  setRepo(repo: string): void {
    this.repo = repo;
  }

  async checkForUpdates(): Promise<UpdateInfo> {
    const currentVersion = app.getVersion();
    try {
      const res = await fetch(`https://api.github.com/repos/${this.repo}/releases/latest`, {
        headers: {
          "User-Agent": `Pi-Studio/${currentVersion}`,
          Accept: "application/vnd.github.v3+json",
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        return { hasUpdate: false, currentVersion };
      }

      const data = (await res.json()) as {
        tag_name: string;
        html_url: string;
        body: string;
        assets: Array<{
          name: string;
          browser_download_url: string;
        }>;
      };

      const latestVersion = (data.tag_name || "").replace(/^v/, "");
      const isNewer = compareVersions(latestVersion, currentVersion) > 0;

      let downloadUrl = data.html_url;
      if (process.platform === "win32") {
        const exeAsset = data.assets?.find((a) => a.name.endsWith(".exe"));
        if (exeAsset) downloadUrl = exeAsset.browser_download_url;
      } else if (process.platform === "darwin") {
        const dmgAsset = data.assets?.find((a) => a.name.endsWith(".dmg") || a.name.endsWith(".zip"));
        if (dmgAsset) downloadUrl = dmgAsset.browser_download_url;
      } else {
        const appImageAsset = data.assets?.find((a) => a.name.endsWith(".AppImage"));
        if (appImageAsset) downloadUrl = appImageAsset.browser_download_url;
      }

      return {
        hasUpdate: isNewer,
        currentVersion,
        latestVersion,
        releaseUrl: data.html_url,
        downloadUrl,
        notes: data.body,
      };
    } catch {
      return { hasUpdate: false, currentVersion };
    }
  }

  async applyUpdate(downloadUrl?: string): Promise<{ success: boolean; message: string }> {
    if (!downloadUrl) return { success: false, message: "No download URL provided" };

    // If it's a web URL or github page, open in default browser
    if (downloadUrl.startsWith("http") && (downloadUrl.includes("/releases/tag") || downloadUrl.includes("/releases/latest"))) {
      await shell.openExternal(downloadUrl);
      return { success: true, message: "Opened release in browser" };
    }

    // Direct binary download for Windows installer (.exe)
    if (process.platform === "win32" && downloadUrl.endsWith(".exe")) {
      try {
        const tempDir = join(tmpdir(), "pi-studio-update");
        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
        const installerPath = join(tempDir, "Pi-Studio-Update.exe");

        const res = await fetch(downloadUrl);
        if (!res.ok || !res.body) {
          await shell.openExternal(downloadUrl);
          return { success: true, message: "Opened download link in browser" };
        }

        const fileStream = createWriteStream(installerPath);
        const reader = res.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fileStream.write(value);
        }
        fileStream.end();

        await new Promise((r) => fileStream.on("finish", r));

        // Launch installer and quit current app
        spawn(installerPath, [], { detached: true, stdio: "ignore" }).unref();
        app.quit();
        return { success: true, message: "Launching installer..." };
      } catch (err) {
        console.error("Direct download failed, opening browser", err);
        await shell.openExternal(downloadUrl);
        return { success: true, message: "Opened download in browser" };
      }
    }

    // Default: open in browser
    await shell.openExternal(downloadUrl);
    return { success: true, message: "Opened release download in browser" };
  }
}
