import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { unpacked } from "./paths.ts";

describe("unpacked()", () => {
  // Regression: Pi (a separate Node process) cannot read inside app.asar, so the bridge extension path
  // must be rewritten to app.asar.unpacked — on Windows paths too.
  it("maps app.asar paths to existing app.asar.unpacked twins (both separators)", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-studio-asar-"));
    mkdirSync(join(root, "app.asar.unpacked", "resources", "bridge"), { recursive: true });
    writeFileSync(join(root, "app.asar.unpacked", "resources", "bridge", "studio-bridge.ts"), "");
    const win = `${root}\\app.asar\\resources\\bridge\\studio-bridge.ts`;
    const posix = `${root}/app.asar/resources/bridge/studio-bridge.ts`;
    expect(unpacked(win)).toContain("app.asar.unpacked");
    expect(unpacked(posix)).toContain("app.asar.unpacked");
  });

  it("leaves dev paths and missing twins untouched", () => {
    expect(unpacked("/repo/apps/desktop/resources/bridge/x.ts")).toBe("/repo/apps/desktop/resources/bridge/x.ts");
    expect(unpacked("/nope/app.asar/x.ts")).toBe("/nope/app.asar/x.ts");
  });
});
