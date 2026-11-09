import { describe, expect, it } from "vitest";
import { computeRouterMetrics, type RouterResult } from "../eval/router-metrics.ts";
import { ROUTER_CASES } from "../eval/router-cases.ts";

const r = (id: string, exp: RouterResult["expectedTier"], pred: RouterResult["predictedTier"], ok = true): RouterResult => ({
  id,
  expectedTier: exp,
  expectedReasoning: "low",
  predictedTier: pred,
  predictedReasoning: "low",
  selectedModel: null,
  selectedTier: pred,
  confidence: 0.8,
  ms: 100,
  ok,
});

describe("router eval", () => {
  it("cases are unique and cover all tiers", () => {
    expect(new Set(ROUTER_CASES.map((c) => c.id)).size).toBe(ROUTER_CASES.length);
    for (const t of ["fast", "balanced", "heavy"]) expect(ROUTER_CASES.some((c) => c.tier === t)).toBe(true);
  });

  it("computes accuracy, over/under provisioning and errors", () => {
    const m = computeRouterMetrics([
      r("a", "fast", "fast"),
      r("b", "fast", "heavy"),
      r("c", "heavy", "balanced"),
      r("d", "balanced", null, false),
    ]);
    expect(m.errors).toBe(1);
    expect(m.tierAccuracy).toBeCloseTo(1 / 3);
    expect(m.withinOneAccuracy).toBeCloseTo(2 / 3);
    expect(m.overProvisioned).toBeCloseTo(1 / 3);
    expect(m.underProvisioned).toBeCloseTo(1 / 3);
    expect(m.confusion.fast.heavy).toBe(1);
    expect(m.misrouted.map((x) => x.id)).toEqual(["b", "c"]);
  });
});
