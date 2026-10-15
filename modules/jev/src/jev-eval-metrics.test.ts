import { describe, expect, it } from "vitest";
import { computeMetrics } from "../eval/metrics.ts";

describe("eval metrics", () => {
  it("computes accuracy and brier score correctly", () => {
    const results = [
      { id: "1", tag: "bug", label: true, prob: 0.9, ms: 100, ok: true },
      { id: "2", tag: "bug", label: true, prob: 0.8, ms: 200, ok: true },
      { id: "3", tag: "clean", label: false, prob: 0.1, ms: 150, ok: true },
      { id: "4", tag: "clean", label: false, prob: 0.7, ms: 250, ok: true }, // misclassified
    ];

    const metrics = computeMetrics(results);
    expect(metrics.total).toBe(4);
    expect(metrics.errors).toBe(0);
    expect(metrics.accuracy).toBe(0.75);
    expect(metrics.misclassified).toEqual([
      { id: "4", expected: false, actualProb: 0.7, predicted: true },
    ]);
    expect(metrics.p50Ms).toBe(200);
    expect(metrics.p95Ms).toBe(250);
    expect(metrics.byTag.bug!.accuracy).toBe(1.0);
    expect(metrics.byTag.clean!.accuracy).toBe(0.5);
  });

  it("handles errors gracefully", () => {
    const results = [
      { id: "1", tag: "bug", label: true, prob: null, ms: 50, ok: false },
      { id: "2", tag: "bug", label: true, prob: 0.9, ms: 100, ok: true },
    ];
    const metrics = computeMetrics(results);
    expect(metrics.total).toBe(2);
    expect(metrics.errors).toBe(1);
    expect(metrics.accuracy).toBe(1.0);
  });
});
