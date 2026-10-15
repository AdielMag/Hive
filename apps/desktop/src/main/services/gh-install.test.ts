import { describe, expect, it } from "vitest";
import { GhInstallService } from "./gh-install.ts";

describe("GhInstallService", () => {
  it("probes gh version successfully when binary exists", () => {
    const fakeExec = ((_cmd: string, args: string[]) => {
      if (args.includes("--version")) {
        return "gh version 2.102.0 (2026-09-30)\nhttps://github.com/cli/cli/releases/tag/v2.102.0";
      }
      throw new Error("unexpected command");
    }) as any;

    const service = new GhInstallService({
      env: { HIVE_GH_CLI: process.execPath }, // use node binary as existing file
      execSync: fakeExec,
    });

    const result = service.locate();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.version).toBe("2.102.0");
    }
  });

  it("reports failure when gh is not found", () => {
    const service = new GhInstallService({
      env: { PATH: "", HIVE_GH_CLI: "" },
      platform: "linux",
      execSync: (() => {
        throw new Error("not found");
      }) as any,
    });

    const result = service.locate();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("GitHub CLI (`gh`) was not found");
      expect(result.searched.length).toBeGreaterThan(0);
    }
  });
});
