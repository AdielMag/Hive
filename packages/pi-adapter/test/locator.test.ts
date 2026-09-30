import { describe, expect, it } from "vitest";
import { locatePi } from "../src/node/locator.ts";

describe("Pi locator", () => {
  it("locates installed Pi on this machine", () => {
    const result = locatePi();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.info.version).toMatch(/^0\.\d+\.\d+/);
    expect(result.info.cliPath).toContain("cli.js");
    expect(result.info.nodePath).toContain("node");
    expect(["supported", "untested-newer"]).toContain(result.info.support);
  });
});
