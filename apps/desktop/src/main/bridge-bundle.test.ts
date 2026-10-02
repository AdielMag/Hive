import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs build script without type declarations
import { BRIDGE_EXTERNALS, bundleBridge } from "../../scripts/build-bridge.mjs";

describe("bridge extension bundle", () => {
  // Regression: packaged builds shipped the raw studio-bridge.ts, whose `@hive/protocol` import
  // can't resolve outside the monorepo, so Pi crashed on start and every RPC failed with
  // `Session "sess_N" is not active`. The shipped bundle may only import Node built-ins and Pi itself.
  it("only imports node built-ins and Pi", async () => {
    const outfile = await bundleBridge(join(mkdtempSync(join(tmpdir(), "hive-bridge-")), "studio-bridge.js"));
    const code = readFileSync(outfile, "utf8");
    const specifiers = [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1]!);
    const disallowed = specifiers.filter((s) => !s.startsWith("node:") && !(BRIDGE_EXTERNALS as string[]).includes(s));
    expect(disallowed).toEqual([]);
    expect(code).toMatch(/export\s*\{[^}]*\bas default\b|export default/);
  });
});
