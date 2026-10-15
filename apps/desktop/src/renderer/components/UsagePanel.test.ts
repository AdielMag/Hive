import { describe, expect, it } from "vitest";
import { computeTokenMetrics } from "./UsagePanel.tsx";
import type { SessionStats } from "@hive/protocol";

describe("computeTokenMetrics", () => {
  it("returns zeroed metrics for null stats", () => {
    const metrics = computeTokenMetrics(null, 100_000);
    expect(metrics.totalTokens).toBe(0);
    expect(metrics.inputTokens).toBe(0);
    expect(metrics.outputTokens).toBe(0);
    expect(metrics.cacheReadTokens).toBe(0);
    expect(metrics.cacheWriteTokens).toBe(0);
    expect(metrics.cacheHitRate).toBe(0);
    expect(metrics.contextTokens).toBe(0);
    expect(metrics.contextWindow).toBe(100_000);
    expect(metrics.contextPercent).toBe(0);
    expect(metrics.remainingTokens).toBe(100_000);
    expect(metrics.isHighContext).toBe(false);
    expect(metrics.isCriticalContext).toBe(false);
  });

  it("calculates token proportions and cache hit rate accurately", () => {
    const mockStats: SessionStats = {
      sessionId: "sess-1",
      sessionFile: "/path/to/session.jsonl",
      userMessages: 2,
      assistantMessages: 2,
      toolCalls: 4,
      toolResults: 4,
      totalMessages: 8,
      cost: 0.05,
      tokens: {
        input: 2_000,
        output: 500,
        cacheRead: 8_000,
        cacheWrite: 0,
        total: 10_500,
      },
      contextUsage: {
        tokens: 30_000,
        contextWindow: 100_000,
        percent: 30,
      },
    };

    const metrics = computeTokenMetrics(mockStats);
    expect(metrics.totalTokens).toBe(10_500);
    expect(metrics.inputTokens).toBe(2_000);
    expect(metrics.outputTokens).toBe(500);
    expect(metrics.cacheReadTokens).toBe(8_000);
    expect(metrics.cacheWriteTokens).toBe(0);

    // Cache hit rate = 8000 / (2000 + 8000 + 0) = 80%
    expect(metrics.cacheHitRate).toBe(80);

    // Token percentages: 2000 / 10500 ~ 19.047%, 8000 / 10500 ~ 76.19%
    expect(Math.round(metrics.inputPct)).toBe(19);
    expect(Math.round(metrics.cacheReadPct)).toBe(76);

    // Context usage
    expect(metrics.contextPercent).toBe(30);
    expect(metrics.remainingTokens).toBe(70_000);
    expect(metrics.isHighContext).toBe(false);
    expect(metrics.isCriticalContext).toBe(false);
  });

  it("detects high context and critical context thresholds", () => {
    const warnStats: SessionStats = {
      sessionId: "sess-2",
      sessionFile: "/path/to/session2.jsonl",
      userMessages: 10,
      assistantMessages: 10,
      toolCalls: 20,
      toolResults: 20,
      totalMessages: 40,
      cost: 0.25,
      tokens: {
        input: 50_000,
        output: 10_000,
        cacheRead: 100_000,
        cacheWrite: 5_000,
        total: 165_000,
      },
      contextUsage: {
        tokens: 82_000,
        contextWindow: 100_000,
        percent: 82,
      },
    };

    const warnMetrics = computeTokenMetrics(warnStats);
    expect(warnMetrics.isHighContext).toBe(true);
    expect(warnMetrics.isCriticalContext).toBe(false);

    const critStats: SessionStats = {
      ...warnStats,
      contextUsage: {
        tokens: 92_000,
        contextWindow: 100_000,
        percent: 92,
      },
    };

    const critMetrics = computeTokenMetrics(critStats);
    expect(critMetrics.isHighContext).toBe(true);
    expect(critMetrics.isCriticalContext).toBe(true);
  });
});
