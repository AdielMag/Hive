import { describe, expect, it } from "vitest";
import { computeTokenMetrics } from "./UsagePanel.tsx";
import { collectSubagents, summarizeSubagents } from "../lib/ai/subagents.ts";
import type { SessionStats } from "@hive/protocol";
import type { Timeline } from "@hive/pi-adapter";

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

  it("calculates combined session and subagent usage breakdown", () => {
    const mockStats: SessionStats = {
      sessionId: "sess-1",
      sessionFile: "/path/to/session.jsonl",
      userMessages: 2,
      assistantMessages: 3,
      toolCalls: 5,
      toolResults: 5,
      totalMessages: 10,
      cost: 0.12,
      tokens: {
        input: 4000,
        output: 1000,
        cacheRead: 20000,
        cacheWrite: 0,
        total: 25000,
      },
    };

    const timeline: Timeline = {
      items: [
        {
          kind: "assistant",
          key: "a1",
          streaming: false,
          blocks: [
            {
              type: "toolCall",
              id: "call_scout",
              name: "Agent",
              arguments: { description: "Explore codebase", subagent_type: "scout" },
              complete: true,
            },
            {
              type: "toolCall",
              id: "call_worker",
              name: "Agent",
              arguments: { description: "Implement feature", subagent_type: "worker" },
              complete: true,
            },
          ],
        },
      ],
      toolResults: {
        call_scout: {
          toolCallId: "call_scout",
          toolName: "Agent",
          isError: false,
          text: "Scout complete",
          images: [],
          details: {
            subagentType: "scout",
            description: "Explore codebase",
            status: "completed",
            cost: 0.005,
            totalTokens: 12000,
            toolUses: 4,
            turnCount: 3,
          },
        },
        call_worker: {
          toolCallId: "call_worker",
          toolName: "Agent",
          isError: false,
          text: "Worker complete",
          images: [],
          details: {
            subagentType: "worker",
            description: "Implement feature",
            status: "completed",
            cost: 0.065,
            totalTokens: 35000,
            toolUses: 10,
            turnCount: 7,
          },
        },
      },
    };

    const agents = collectSubagents(timeline, false);
    expect(agents).toHaveLength(2);

    const subagentsSummary = summarizeSubagents(agents);
    expect(subagentsSummary.totalCost).toBeCloseTo(0.07, 5);
    expect(subagentsSummary.totalTokens).toBe(47000);
    expect(subagentsSummary.totalToolUses).toBe(14);
    expect(subagentsSummary.totalTurns).toBe(10);

    const mainCost = mockStats.cost;
    const subagentsCost = subagentsSummary.totalCost;
    const totalSessionCost = mainCost + subagentsCost;
    expect(totalSessionCost).toBeCloseTo(0.19, 5);

    const metrics = computeTokenMetrics(mockStats);
    const combinedTokens = metrics.totalTokens + subagentsSummary.totalTokens;
    expect(combinedTokens).toBe(72000);
  });
});
