import { describe, expect, it } from "vitest";
import { checkLatestRelease, checksumLocation, expectedSha256, isReleasePageUrl, isTrustedDownloadUrl } from "./update-check.ts";
import { isSafeExternalUrl } from "../safe-url.ts";

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

describe("update download trust", () => {
  const asset = "https://github.com/AdielMag/Hive/releases/download/v0.28.0/Hive-Setup-0.28.0.exe";

  it("trusts only this repo's https release assets", () => {
    expect(isTrustedDownloadUrl(asset, REPO)).toBe(true);
    expect(isTrustedDownloadUrl(asset.replace("https:", "http:"), REPO)).toBe(false);
    expect(isTrustedDownloadUrl("https://github.com/evil/Hive/releases/download/v1/x.exe", REPO)).toBe(false);
    expect(isTrustedDownloadUrl("https://github.com.evil.io/AdielMag/Hive/releases/download/v1/x.exe", REPO)).toBe(false);
    expect(isTrustedDownloadUrl("https://github.com/AdielMag/Hive/releases/tag/v1", REPO)).toBe(false);
    expect(isTrustedDownloadUrl("file:///C:/x.exe", REPO)).toBe(false);
    expect(isTrustedDownloadUrl("not a url", REPO)).toBe(false);
  });

  it("recognizes release pages", () => {
    expect(isReleasePageUrl("https://github.com/AdielMag/Hive/releases/tag/v0.28.0", REPO)).toBe(true);
    expect(isReleasePageUrl("https://github.com/AdielMag/Hive/releases/latest", REPO)).toBe(true);
    expect(isReleasePageUrl("https://example.com/AdielMag/Hive/releases/latest", REPO)).toBe(false);
  });

  it("locates SHA256SUMS.txt next to the asset", () => {
    expect(checksumLocation(asset)).toEqual({
      checksumsUrl: "https://github.com/AdielMag/Hive/releases/download/v0.28.0/SHA256SUMS.txt",
      assetName: "Hive-Setup-0.28.0.exe",
    });
  });

  it("parses sha256sum output (text and binary mode)", () => {
    const a = "a".repeat(64);
    const b = "B".repeat(64);
    const sums = `${a}  Hive-0.28.0.dmg\r\n${b} *Hive-Setup-0.28.0.exe\n`;
    expect(expectedSha256(sums, "Hive-Setup-0.28.0.exe")).toBe("b".repeat(64));
    expect(expectedSha256(sums, "Hive-0.28.0.dmg")).toBe(a);
    expect(expectedSha256(sums, "Hive-Setup-0.27.0.exe")).toBeUndefined();
    expect(expectedSha256("garbage  Hive-Setup-0.28.0.exe", "Hive-Setup-0.28.0.exe")).toBeUndefined();
  });
});

describe("isSafeExternalUrl", () => {
  it("allows web and mail links only", () => {
    expect(isSafeExternalUrl("https://pi.dev")).toBe(true);
    expect(isSafeExternalUrl("mailto:a@b.c")).toBe(true);
    expect(isSafeExternalUrl("file:///C:/Windows/System32/calc.exe")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("ms-msdt:/id")).toBe(false);
  });
});
