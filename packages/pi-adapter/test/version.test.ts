import { describe, expect, it } from "vitest";
import { compareVersions, piSupport, MIN_PI_VERSION, TESTED_MAX_PI_VERSION } from "../src/version.ts";

describe("version helpers", () => {
  it("compares dotted numbers correctly", () => {
    expect(compareVersions("0.87.1", "0.87.1")).toBe(0);
    expect(compareVersions("0.87.0", "0.87.1")).toBe(-1);
    expect(compareVersions("0.88.0", "0.87.1")).toBe(1);
    expect(compareVersions("0.99.1", "0.87.1")).toBe(1);
    expect(compareVersions("1.0.0", "0.99.1")).toBe(1);
    expect(compareVersions("0.87.1-beta.1", "0.87.1")).toBe(-1);
  });

  it("classifies Pi version support against tested boundaries", () => {
    expect(piSupport("0.86.0")).toBe("too-old");
    expect(piSupport(MIN_PI_VERSION)).toBe("supported");
    expect(piSupport("0.87.1")).toBe("supported");
    expect(piSupport(TESTED_MAX_PI_VERSION)).toBe("supported");
    expect(piSupport("0.100.0")).toBe("untested-newer");
    expect(piSupport("1.0.0")).toBe("untested-newer");
  });
});
