import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toUnpackedPath, unpacked } from "./paths.ts";

describe("asar path mapping", () => {
  // Regression: Pi (a separate Node process) cannot read inside app.asar, so the bridge extension path
  // must be rewritten to app.asar.unpacked — including Windows-style paths.
  it("rewrites app.asar segments with either separator", () => {
    expect(toUnpackedPath("C:\\Apps\\Pi\\resources\\app.asar\\resources\\bridge\\b.ts")).toBe(
      "C:\\Apps\\Pi\\resources\\app.asar.unpacked\\resources\\bridge\\b.ts",
    );
    expect(toUnpackedPath("/opt/pi/resources/app.asar/resources/b.ts")).toBe("/opt/pi/resources/app.asar.unpacked/resources/b.ts");
    expect(toUnpackedPath("/repo/apps/desktop/resources/b.ts")).toBe("/repo/apps/desktop/resources/b.ts");
  });

  it("only swaps when the unpacked twin exists", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-studio-asar-"));
    mkdirSync(join(root, "app.asar.unpacked", "resources"), { recursive: true });
    writeFileSync(join(root, "app.asar.unpacked", "resources", "b.ts"), "");
    expect(unpacked(join(root, "app.asar", "resources", "b.ts"))).toBe(join(root, "app.asar.unpacked", "resources", "b.ts"));
    expect(unpacked(join(root, "app.asar", "resources", "missing.ts"))).toBe(join(root, "app.asar", "resources", "missing.ts"));
  });
});
