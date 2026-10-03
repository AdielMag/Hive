import { describe, expect, it } from "vitest";
import { checkLatestRelease } from "./update-check.ts";

const REPO = "AdielMag/Hive";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const release = {
  tag_name: "v0.11.0",
  html_url: "https://github.com/AdielMag/Hive/releases/tag/v0.11.0",
  body: "notes",
  assets: [
    { name: "Hive-0.11.0-portable.exe", browser_download_url: "https://x/portable.exe" },
    { name: "Hive-Setup-0.11.0.exe", browser_download_url: "https://x/setup.exe" },
    { name: "Hive-0.11.0-mac-arm64.dmg", browser_download_url: "https://x/mac.dmg" },
  ],
};

describe("checkLatestRelease", () => {
  it("reports a newer release from the API and picks the NSIS installer", async () => {
    const info = await checkLatestRelease({ repo: REPO, currentVersion: "0.9.0", platform: "win32", fetchImpl: async () => json(200, release) });
    expect(info).toMatchObject({ hasUpdate: true, latestVersion: "0.11.0", downloadUrl: "https://x/setup.exe", notes: "notes" });
    expect(info.error).toBeUndefined();
  });

  it("reports up to date when versions match", async () => {
    const info = await checkLatestRelease({ repo: REPO, currentVersion: "0.11.0", platform: "darwin", fetchImpl: async () => json(200, release) });
    expect(info).toMatchObject({ hasUpdate: false, latestVersion: "0.11.0" });
  });

  it("retries the API after a transient failure", async () => {
    let calls = 0;
    const info = await checkLatestRelease({
      repo: REPO,
      currentVersion: "0.9.0",
      platform: "win32",
      fetchImpl: async () => (++calls === 1 ? json(504, {}) : json(200, release)),
    });
    expect(calls).toBe(2);
    expect(info.hasUpdate).toBe(true);
  });

  it("falls back to the release page redirect when the API keeps failing", async () => {
    const fetchImpl = (async (url: string) => {
      if (url.startsWith("https://api.github.com")) return json(504, {});
      const res = new Response(null, { status: 200 });
      Object.defineProperty(res, "url", { value: "https://github.com/AdielMag/Hive/releases/tag/v0.12.0" });
      return res;
    }) as typeof fetch;
    const info = await checkLatestRelease({ repo: REPO, currentVersion: "0.11.0", platform: "win32", fetchImpl });
    expect(info).toMatchObject({
      hasUpdate: true,
      latestVersion: "0.12.0",
      downloadUrl: "https://github.com/AdielMag/Hive/releases/download/v0.12.0/Hive-Setup-0.12.0.exe",
    });
  });

  it("returns an error (not 'up to date') when every lookup fails", async () => {
    const info = await checkLatestRelease({
      repo: REPO,
      currentVersion: "0.9.0",
      platform: "linux",
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    expect(info.hasUpdate).toBe(false);
    expect(info.latestVersion).toBeUndefined();
    expect(info.error).toMatch(/offline/);
  });
});
