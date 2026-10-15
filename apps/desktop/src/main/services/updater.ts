import { app, shell } from "electron";
import type { UpdateProgress } from "@hive/protocol";
import { createHash } from "node:crypto";
import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import {
  checkLatestRelease,
  checksumLocation,
  expectedSha256,
  isReleasePageUrl,
  isTrustedDownloadUrl,
  type UpdateInfo,
} from "./update-check.ts";

export type { UpdateInfo };

type ApplyResult = { success: boolean; message: string };

/** Best-effort delete that never throws (Windows can hold a just-closed file briefly). */
function safeRm(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (err) {
    console.error("[updater] cleanup failed", path, err);
  }
}

export class AppUpdaterService {
  private repo = "AdielMag/Hive";
  /** URLs from the last successful check: the only ones `applyUpdate` will act on (blocks renderer-forced downgrades). */
  private offered = new Set<string>();

  setRepo(repo: string): void {
    this.repo = repo;
    this.offered.clear();
  }

  async checkForUpdates(): Promise<UpdateInfo> {
    const info = await checkLatestRelease({ repo: this.repo, currentVersion: app.getVersion(), platform: process.platform });
    // A failed lookup (offline) keeps the previous offer, mirroring the renderer, which keeps its last known update.
    if (info.error || !info.latestVersion) return info;
    this.offered.clear();
    for (const url of [info.downloadUrl, info.releaseUrl]) {
      if (!url) continue;
      try {
        this.offered.add(new URL(url).href);
      } catch {
        /* malformed URL from the API: just don't offer it */
      }
    }
    return info;
  }

  /**
   * `rawUrl` comes from the renderer, so it is never trusted as-is: it must be one this service offered
   * in its last check, and be this repo's release page or release asset. A downloaded installer runs
   * only after its SHA-256 matches the release's SHA256SUMS.txt.
   */
  async applyUpdate(rawUrl?: string, onProgress: (progress: UpdateProgress) => void = () => {}): Promise<ApplyResult> {
    if (!rawUrl) return { success: false, message: "No download URL provided" };
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { success: false, message: "Invalid update URL" };
    }
    // From here on only the normalized href is used, never the raw renderer string.
    const downloadUrl = parsed.href;

    const releasePage = isReleasePageUrl(downloadUrl, this.repo);
    const trustedAsset = isTrustedDownloadUrl(downloadUrl, this.repo);
    if (!this.offered.has(downloadUrl) || (!releasePage && !trustedAsset)) {
      console.error("[updater] refusing update URL that wasn't offered by the last check", downloadUrl);
      return { success: false, message: "Refused an update URL that didn't come from the latest release check" };
    }

    const openInBrowser = async (message: string): Promise<ApplyResult> => {
      await shell.openExternal(downloadUrl);
      onProgress({ phase: "browser", received: 0, message });
      return { success: true, message };
    };

    // Only the Windows NSIS installer is downloaded and launched in-app; everything else goes to the browser.
    if (!trustedAsset || process.platform !== "win32" || !parsed.pathname.toLowerCase().endsWith(".exe")) {
      return openInBrowser(trustedAsset ? "Opened release download in browser" : "Opened release in browser");
    }

    onProgress({ phase: "downloading", received: 0 });
    let tempDir: string | undefined;
    let fileStream: ReturnType<typeof createWriteStream> | undefined;
    try {
      const expected = await this.fetchExpectedHash(downloadUrl);
      if (!expected) {
        return openInBrowser("This release has no checksum to verify against. Opened the download in your browser instead");
      }

      const res = await fetch(downloadUrl);
      if (!res.ok || !res.body) return openInBrowser("Opened download link in browser");

      // Fresh private dir per attempt + exclusive create: nothing else can pre-plant or reuse the path.
      tempDir = mkdtempSync(join(tmpdir(), "hive-update-"));
      const installerPath = join(tempDir, "Hive-Update.exe");

      const totalHeader = Number(res.headers.get("content-length"));
      const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : undefined;
      let received = 0;
      let lastEmit = 0;
      const hash = createHash("sha256");

      const out = createWriteStream(installerPath, { flags: "wx" });
      fileStream = out;
      const closed = new Promise<void>((resolve, reject) => {
        out.on("close", () => resolve());
        out.on("error", reject);
      });
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        hash.update(value);
        if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
        const now = Date.now();
        if (now - lastEmit >= 100) {
          lastEmit = now;
          onProgress({ phase: "downloading", received, total });
        }
      }
      out.end();
      await closed; // handle fully released before hashing result is acted on / file is deleted
      onProgress({ phase: "downloading", received, total: total ?? received });

      const actual = hash.digest("hex");
      if (actual !== expected) {
        safeRm(tempDir);
        console.error(`[updater] checksum mismatch: expected ${expected}, got ${actual}`);
        const message = "The downloaded installer failed its checksum check and was deleted. Nothing was installed.";
        onProgress({ phase: "error", received, total, message });
        return { success: false, message };
      }

      // Launch installer and quit current app (short pause so the "launching" state is visible).
      onProgress({ phase: "launching", received, total: total ?? received, message: "Launching installer…" });
      spawn(installerPath, [], { detached: true, stdio: "ignore" }).unref();
      setTimeout(() => app.quit(), 800);
      return { success: true, message: "Launching installer..." };
    } catch (err) {
      console.error("Direct download failed, opening browser", err);
      fileStream?.destroy();
      if (tempDir) safeRm(tempDir);
      onProgress({ phase: "error", received: 0, message: "Download failed — opening in browser instead" });
      await shell.openExternal(downloadUrl);
      return { success: true, message: "Opened download in browser" };
    }
  }

  /** SHA-256 for the asset from the release's SHA256SUMS.txt, or undefined if the release has none. */
  private async fetchExpectedHash(downloadUrl: string): Promise<string | undefined> {
    const { checksumsUrl, assetName } = checksumLocation(downloadUrl);
    const res = await fetch(checksumsUrl, { signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`checksum file returned ${res.status}`);
    return expectedSha256(await res.text(), assetName);
  }
}
