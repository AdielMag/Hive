import { app, shell } from "electron";
import { compareVersions } from "@pi-studio/pi-adapter";
import type { UpdateProgress } from "@pi-studio/protocol";
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
        // Prefer the NSIS installer over the portable build.
        const exeAsset =
          data.assets?.find((a) => /setup.*\.exe$/i.test(a.name)) ?? data.assets?.find((a) => a.name.endsWith(".exe") && !/portable/i.test(a.name));
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

  async applyUpdate(
    downloadUrl?: string,
    onProgress: (progress: UpdateProgress) => void = () => {},
  ): Promise<{ success: boolean; message: string }> {
    if (!downloadUrl) return { success: false, message: "No download URL provided" };

    const openInBrowser = async (message: string) => {
      await shell.openExternal(downloadUrl);
      onProgress({ phase: "browser", received: 0, message });
      return { success: true, message };
    };

    // If it's a web URL or github page, open in default browser
    if (downloadUrl.startsWith("http") && (downloadUrl.includes("/releases/tag") || downloadUrl.includes("/releases/latest"))) {
      return openInBrowser("Opened release in browser");
    }

    // Direct binary download for Windows installer (.exe)
    if (process.platform === "win32" && downloadUrl.endsWith(".exe")) {
      onProgress({ phase: "downloading", received: 0 });
      try {
        const tempDir = join(tmpdir(), "pi-studio-update");
        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
        const installerPath = join(tempDir, "Pi-Studio-Update.exe");

        const res = await fetch(downloadUrl);
        if (!res.ok || !res.body) return openInBrowser("Opened download link in browser");

        const totalHeader = Number(res.headers.get("content-length"));
        const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : undefined;
        let received = 0;
        let lastEmit = 0;

        const fileStream = createWriteStream(installerPath);
        const finished = new Promise<void>((resolve, reject) => {
          fileStream.on("finish", () => resolve());
          fileStream.on("error", reject);
        });
        const reader = res.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (!fileStream.write(value)) await new Promise<void>((r) => fileStream.once("drain", () => r()));
          const now = Date.now();
          if (now - lastEmit >= 100) {
            lastEmit = now;
            onProgress({ phase: "downloading", received, total });
          }
        }
        fileStream.end();
        await finished;
        onProgress({ phase: "downloading", received, total: total ?? received });

        // Launch installer and quit current app (short pause so the "launching" state is visible).
        onProgress({ phase: "launching", received, total: total ?? received, message: "Launching installer…" });
        spawn(installerPath, [], { detached: true, stdio: "ignore" }).unref();
        setTimeout(() => app.quit(), 800);
        return { success: true, message: "Launching installer..." };
      } catch (err) {
        console.error("Direct download failed, opening browser", err);
        onProgress({ phase: "error", received: 0, message: "Download failed — opening in browser instead" });
        await shell.openExternal(downloadUrl);
        return { success: true, message: "Opened download in browser" };
      }
    }

    // Default: open in browser
    return openInBrowser("Opened release download in browser");
  }
}
