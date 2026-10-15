import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawn = vi.fn(() => ({ unref: () => {} }));
const openExternal = vi.fn(async () => {});
vi.mock("electron", () => ({ app: { getVersion: () => "0.27.0", quit: vi.fn() }, shell: { openExternal } }));
vi.mock("node:child_process", () => ({ spawn }));

const { AppUpdaterService } = await import("./updater.ts");

const TAG = "v0.28.0";
const EXE = `https://github.com/AdielMag/Hive/releases/download/${TAG}/Hive-Setup-0.28.0.exe`;
const SUMS = `https://github.com/AdielMag/Hive/releases/download/${TAG}/SHA256SUMS.txt`;
const PAYLOAD = new TextEncoder().encode("pretend installer bytes");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

function mockNetwork(opts: { sums?: string | null; payload?: Uint8Array } = {}) {
  const payload = opts.payload ?? PAYLOAD;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("api.github.com")) {
        return new Response(
          JSON.stringify({ tag_name: TAG, html_url: `https://github.com/AdielMag/Hive/releases/tag/${TAG}`, assets: [{ name: "Hive-Setup-0.28.0.exe", browser_download_url: EXE }] }),
          { status: 200 },
        );
      }
      if (url === SUMS) {
        if (opts.sums === null) return new Response("nope", { status: 404 });
        return new Response(opts.sums ?? `${sha(PAYLOAD)}  Hive-Setup-0.28.0.exe\n`, { status: 200 });
      }
      if (url === EXE) return new Response(payload, { status: 200, headers: { "content-length": String(payload.byteLength) } });
      return new Response("not found", { status: 404 });
    }),
  );
}

const realPlatform = process.platform;
beforeEach(() => {
  Object.defineProperty(process, "platform", { value: "win32" });
  spawn.mockClear();
  openExternal.mockClear();
});
afterEach(() => {
  Object.defineProperty(process, "platform", { value: realPlatform });
  vi.unstubAllGlobals();
});

describe("AppUpdaterService.applyUpdate", () => {
  it("refuses a URL the last check didn't offer (even a genuine older release)", async () => {
    mockNetwork();
    const svc = new AppUpdaterService();
    await svc.checkForUpdates();
    const older = EXE.replaceAll("0.28.0", "0.20.0");
    const res = await svc.applyUpdate(older);
    expect(res.success).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("refuses everything before any check", async () => {
    mockNetwork();
    const res = await new AppUpdaterService().applyUpdate(EXE);
    expect(res.success).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("runs the installer only when the SHA-256 matches", async () => {
    mockNetwork();
    const svc = new AppUpdaterService();
    await svc.checkForUpdates();
    const res = await svc.applyUpdate(EXE);
    expect(res.success).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("deletes and never runs a tampered installer", async () => {
    mockNetwork({ payload: new TextEncoder().encode("evil bytes") });
    const svc = new AppUpdaterService();
    await svc.checkForUpdates();
    const res = await svc.applyUpdate(EXE);
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/checksum/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("falls back to the browser when the release has no SHA256SUMS.txt", async () => {
    mockNetwork({ sums: null });
    const svc = new AppUpdaterService();
    await svc.checkForUpdates();
    const res = await svc.applyUpdate(EXE);
    expect(res.success).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith(EXE);
  });

  it("keeps the previous offer when a later check fails (offline)", async () => {
    mockNetwork();
    const svc = new AppUpdaterService();
    await svc.checkForUpdates();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await svc.checkForUpdates();
    mockNetwork();
    const res = await svc.applyUpdate(EXE);
    expect(res.success).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
