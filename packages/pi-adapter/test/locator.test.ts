import { describe, expect, it } from "vitest";
import { locatePi } from "../src/node/locator.ts";

describe("Pi locator", () => {
  it("locates installed Pi on this machine or reports an informative error if absent in CI", () => {
    const result = locatePi();
    if (result.ok) {
      expect(result.info.version).toMatch(/^0\.\d+\.\d+/);
      expect(result.info.cliPath).toContain("cli.js");
      expect(result.info.nodePath).toContain("node");
      expect(["supported", "untested-newer"]).toContain(result.info.support);
    } else {
      expect(typeof result.error).toBe("string");
    }
  });
});
