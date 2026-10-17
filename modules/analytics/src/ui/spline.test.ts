import { describe, expect, it } from "vitest";
import { monotoneSplinePath } from "./spline.ts";

const ys = (d: string): number[] => [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));

describe("monotoneSplinePath", () => {
  it("handles empty and single point", () => {
    expect(monotoneSplinePath([])).toBe("");
    expect(monotoneSplinePath([[1, 2]])).toBe("M 1.0,2.0");
  });
  it("never goes below the bottom line (spike after zeros)", () => {
    const bottom = 100;
    const d = monotoneSplinePath([[0, bottom], [10, bottom], [20, 10], [30, bottom], [40, bottom]], 0, bottom);
    expect(d.startsWith("M 0.0,100.0 C")).toBe(true);
    expect(Math.max(...ys(d))).toBeLessThanOrEqual(bottom);
  });
  it("is flat across equal points", () => {
    expect(new Set(ys(monotoneSplinePath([[0, 5], [10, 5], [20, 5]]))).size).toBe(1);
  });
});
