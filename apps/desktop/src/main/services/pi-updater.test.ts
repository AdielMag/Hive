import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PiUpdaterService } from "./pi-updater.ts";

describe("PiUpdaterService", () => {
  let tempDir: string;
  let piDir: string;
  let agentDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `hive-test-pi-updater-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    piDir = join(tempDir, "global", "node_modules", "@earendil-works", "pi-coding-agent");
    agentDir = join(tempDir, "agent");
    mkdirSync(piDir, { recursive: true });
    mkdirSync(join(agentDir, "npm", "node_modules", "pi-antigravity"), { recursive: true });
    mkdirSync(join(agentDir, "npm", "node_modules", "@gotgenes", "pi-anthropic-auth"), { recursive: true });

    writeFileSync(join(piDir, "package.json"), JSON.stringify({ version: "0.87.0" }));
    writeFileSync(
      join(agentDir, "npm", "package.json"),
      JSON.stringify({
        dependencies: {
          "pi-antigravity": "^0.8.0",
          "@gotgenes/pi-anthropic-auth": "^3.0.1",
        },
      }),
    );
    writeFileSync(
      join(agentDir, "npm", "node_modules", "pi-antigravity", "package.json"),
      JSON.stringify({ version: "0.8.0" }),
    );
    writeFileSync(
      join(agentDir, "npm", "node_modules", "@gotgenes", "pi-anthropic-auth", "package.json"),
      JSON.stringify({ version: "3.0.1" }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("detects updates for both Pi CLI and installed extensions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("pi-coding-agent")) {
          return new Response(JSON.stringify({ version: "0.87.1" }), { status: 200 });
        }
        if (url.includes("pi-antigravity")) {
          return new Response(JSON.stringify({ version: "0.10.0" }), { status: 200 });
        }
        if (url.includes("pi-anthropic-auth")) {
          return new Response(JSON.stringify({ version: "3.4.2" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }),
    );

    const service = new PiUpdaterService(
      () => piDir,
      () => agentDir,
    );

    const info = await service.check();
    expect(info.hasUpdate).toBe(true);
    expect(info.cliHasUpdate).toBe(true);
    expect(info.currentVersion).toBe("0.87.0");
    expect(info.latestVersion).toBe("0.87.1");
    expect(info.extensions).toHaveLength(2);

    const antigravity = info.extensions?.find((e) => e.name === "pi-antigravity");
    expect(antigravity).toBeDefined();
    expect(antigravity?.hasUpdate).toBe(true);
    expect(antigravity?.currentVersion).toBe("0.8.0");
    expect(antigravity?.latestVersion).toBe("0.10.0");

    const anthropicAuth = info.extensions?.find((e) => e.name === "@gotgenes/pi-anthropic-auth");
    expect(anthropicAuth).toBeDefined();
    expect(anthropicAuth?.hasUpdate).toBe(true);
    expect(anthropicAuth?.currentVersion).toBe("3.0.1");
    expect(anthropicAuth?.latestVersion).toBe("3.4.2");
  });

  it("detects extension updates when Pi CLI has no update", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("pi-coding-agent")) {
          return new Response(JSON.stringify({ version: "0.87.0" }), { status: 200 });
        }
        if (url.includes("pi-antigravity")) {
          return new Response(JSON.stringify({ version: "0.10.0" }), { status: 200 });
        }
        if (url.includes("pi-anthropic-auth")) {
          return new Response(JSON.stringify({ version: "3.0.1" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }),
    );

    const service = new PiUpdaterService(
      () => piDir,
      () => agentDir,
    );

    const info = await service.check();
    expect(info.hasUpdate).toBe(true);
    expect(info.cliHasUpdate).toBe(false);
    expect(info.latestVersion).toBe("0.87.0");
    const antigravity = info.extensions?.find((e) => e.name === "pi-antigravity");
    expect(antigravity?.hasUpdate).toBe(true);
  });

  it("reports no update when everything is on latest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("pi-coding-agent")) {
          return new Response(JSON.stringify({ version: "0.87.0" }), { status: 200 });
        }
        if (url.includes("pi-antigravity")) {
          return new Response(JSON.stringify({ version: "0.8.0" }), { status: 200 });
        }
        if (url.includes("pi-anthropic-auth")) {
          return new Response(JSON.stringify({ version: "3.0.1" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }),
    );

    const service = new PiUpdaterService(
      () => piDir,
      () => agentDir,
    );

    const info = await service.check();
    expect(info.hasUpdate).toBe(false);
    expect(info.cliHasUpdate).toBe(false);

    const installRes = await service.install();
    expect(installRes.success).toBe(true);
    expect(installRes.message).toBe("Everything is already up to date.");

    const cliRes = await service.install("cli");
    expect(cliRes.success).toBe(true);
    expect(cliRes.message).toBe("Pi CLI is already up to date.");

    const extRes = await service.install("extensions");
    expect(extRes.success).toBe(true);
    expect(extRes.message).toBe("Extensions are already up to date.");

    const singleRes = await service.install("pi-antigravity");
    expect(singleRes.success).toBe(true);
    expect(singleRes.message).toBe("pi-antigravity is already up to date.");
  });

  it("handles network errors during check and does not falsely claim up-to-date in install()", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network unreachable");
      }),
    );

    const service = new PiUpdaterService(
      () => piDir,
      () => agentDir,
    );

    const info = await service.check();
    expect(info.hasUpdate).toBe(false);
    expect(info.error).toContain("Network unreachable");

    const installRes = await service.install();
    expect(installRes.success).toBe(false);
    expect(installRes.message).toContain("Network unreachable");
  });
});
