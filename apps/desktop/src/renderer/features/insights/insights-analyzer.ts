import type { UsageReport } from "@hive/protocol";
import type { UsageGroupRow, UsageTotals } from "@hive/pi-adapter";
import { formatCost, formatTokens } from "../../lib/format.ts";

export interface AiInsightItem {
  id: string;
  type: "positive" | "warning" | "opportunity" | "trend";
  title: string;
  description: string;
  metric?: string;
  impact?: "High" | "Medium" | "Low";
}

export interface AiRecommendation {
  id: string;
  title: string;
  action: string;
  estimatedSavings?: string;
  difficulty: "Easy" | "Moderate";
}

export interface AiUsageAnalysisResult {
  generatedAt: number;
  score: number; // 0 - 100
  scoreLabel: string;
  summary: string;
  runRate30d: string;
  insights: AiInsightItem[];
  recommendations: AiRecommendation[];
}

export function analyzeUsageTelemetry(
  _usage: UsageReport,
  totals: UsageTotals,
  byModel: UsageGroupRow[],
  _byProvider: UsageGroupRow[],
  _byProject: UsageGroupRow[],
  activeDays: number,
  _totalDays: number,
): AiUsageAnalysisResult {
  const insights: AiInsightItem[] = [];
  const recommendations: AiRecommendation[] = [];

  const totalCost = Math.max(0, totals.cost);
  const totalTokens = Math.max(0, totals.tokens);
  const cacheHitRate = totals.cacheRead / Math.max(1, totals.input + totals.cacheRead);
  const cacheTokens = totals.cacheRead;

  // 1. Calculate Efficiency Score (0 to 100)
  // Factors: Cache hit rate (up to 40 pts), model balance (30 pts), output efficiency (30 pts)
  let score = 50;
  score += Math.round(cacheHitRate * 35);
  if (byModel.length > 1) score += 10;
  if (totals.turns > 0 && totalCost / totals.turns < 0.05) score += 5;
  score = Math.min(98, Math.max(25, score));

  let scoreLabel = "Optimal";
  if (score < 45) scoreLabel = "Needs Optimization";
  else if (score < 70) scoreLabel = "Moderate Efficiency";
  else if (score < 85) scoreLabel = "High Efficiency";

  // 2. Cache Hit Rate Analysis
  if (cacheHitRate > 0.4) {
    const savedDollars = (cacheTokens / 1_000_000) * 2.5; // avg estimate
    insights.push({
      id: "cache-strong",
      type: "positive",
      title: "Exceptional Prompt Cache Reuse",
      description: `${Math.round(cacheHitRate * 100)}% of input tokens are served directly from cache, saving prompt execution time and lowering provider costs significantly.`,
      metric: `${formatTokens(cacheTokens)} cached (~${formatCost(savedDollars)} saved)`,
      impact: "High",
    });
  } else if (cacheHitRate < 0.15 && totals.turns > 15) {
    insights.push({
      id: "cache-low",
      type: "opportunity",
      title: "Unrealized Cache Savings",
      description: "Cache hit rate is below 15%. Structuring repetitive system prompts, repository rules, and project context at the beginning of sessions enables provider prompt caching.",
      metric: `${Math.round(cacheHitRate * 100)}% hit rate`,
      impact: "High",
    });
    recommendations.push({
      id: "rec-cache",
      title: "Leverage Prompt Prefix Stability",
      action: "Keep system instructions and long context stable across consecutive turns to trigger 50–90% cheaper cache reads.",
      estimatedSavings: "Up to 40% on input tokens",
      difficulty: "Easy",
    });
  }

  // 3. Top Model Analysis
  if (byModel.length > 0) {
    const topModel = byModel[0]!;
    const topModelShare = totalCost > 0 ? (topModel.cost / totalCost) * 100 : 0;
    const modelName = topModel.key.split("/").slice(1).join("/") || topModel.key;

    if (topModelShare > 65) {
      insights.push({
        id: "model-concentration",
        type: "trend",
        title: `Heavy Reliance on ${modelName}`,
        description: `${modelName} accounts for ${Math.round(topModelShare)}% of total spend (${formatCost(topModel.cost)}).`,
        metric: `${Math.round(topModelShare)}% of spend`,
        impact: "Medium",
      });

      if (topModel.key.includes("opus") || topModel.key.includes("gpt-4") || topModel.key.includes("claude-3-7-sonnet")) {
        recommendations.push({
          id: "rec-tiering",
          title: "Implement Model Tiering",
          action: "Route routine queries, file indexing, and unit test generation to faster models (like Haiku or Flash) and reserve flagship models for architecture.",
          estimatedSavings: "25% - 45% on spend",
          difficulty: "Easy",
        });
      }
    }
  }

  // 4. Token Throughput & Run Rate Projection
  const dailyAverageCost = totalCost / Math.max(1, activeDays || 1);
  const projected30d = dailyAverageCost * 30;

  insights.push({
    id: "run-rate",
    type: "trend",
    title: "Trajectory & Velocity",
    description: `Average daily spend is ${formatCost(dailyAverageCost)} across ${activeDays} active day(s). Active turn density: ${Math.round(totals.turns / Math.max(1, activeDays))} turns/day.`,
    metric: `${formatCost(projected30d)} / month projected`,
    impact: "Medium",
  });

  // 5. Input vs Output Balance
  const outputRatio = totals.output / Math.max(1, totalTokens);
  if (outputRatio > 0.3) {
    insights.push({
      id: "high-generation",
      type: "positive",
      title: "High Code Generation Yield",
      description: "Generative output ratio is high relative to context, reflecting concise prompting and productive code generation.",
      metric: `${Math.round(outputRatio * 100)}% output ratio`,
      impact: "Low",
    });
  }

  // 6. Context Window Compaction Recommendation
  if (totals.input > 300_000) {
    recommendations.push({
      id: "rec-compaction",
      title: "Tune Auto-Compaction Threshold",
      action: "Enable auto-compaction in Settings with a 16K–32K reserve token budget to prevent oversized context bloat in long coding sessions.",
      estimatedSavings: "Reduces repetitive per-turn token load",
      difficulty: "Easy",
    });
  }

  const summary = `System health score is ${score}/100 (${scoreLabel}). Over the analyzed period, ${formatTokens(totalTokens)} tokens were processed across ${totals.turns} turns with an average cost of ${formatCost(dailyAverageCost)}/day.`;

  return {
    generatedAt: Date.now(),
    score,
    scoreLabel,
    summary,
    runRate30d: formatCost(projected30d),
    insights,
    recommendations,
  };
}
