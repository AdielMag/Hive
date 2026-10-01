import { describe, expect, it } from "vitest";
import { analyzeUsageTelemetry } from "./insights-analyzer.ts";
import type { UsageReport } from "@pi-studio/protocol";
import type { UsageGroupRow, UsageTotals } from "@pi-studio/pi-adapter";

describe("insights-analyzer", () => {
  const dummyUsage: UsageReport = {
    generatedAt: Date.now(),
    scanMs: 12,
    sessionFiles: 5,
    sessionDays: 3,
    buckets: [],
  };

  const dummyTotals: UsageTotals = {
    turns: 40,
    cost: 3.5,
    tokens: 150000,
    input: 100000,
    output: 20000,
    cacheRead: 25000,
    cacheWrite: 5000,
  };

  const dummyByModel: UsageGroupRow[] = [
    {
      key: "anthropic/claude-3-7-sonnet",
      cost: 2.8,
      turns: 30,
      input: 80000,
      output: 16000,
      cacheRead: 20000,
      cacheWrite: 4000,
    },
  ];

  it("calculates telemetry health score and identifies recommendations", () => {
    const result = analyzeUsageTelemetry(
      dummyUsage,
      dummyTotals,
      dummyByModel,
      [],
      [],
      3,
      7,
    );

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.scoreLabel).toBeDefined();
    expect(result.runRate30d).toContain("$");
    expect(result.insights.length).toBeGreaterThan(0);
  });

  it("identifies high model concentration when top model dominates spend", () => {
    const result = analyzeUsageTelemetry(
      dummyUsage,
      dummyTotals,
      dummyByModel,
      [],
      [],
      3,
      7,
    );

    const modelInsight = result.insights.find((i) => i.id === "model-concentration");
    expect(modelInsight).toBeDefined();
    expect(modelInsight?.title).toContain("claude-3-7-sonnet");
  });
});
