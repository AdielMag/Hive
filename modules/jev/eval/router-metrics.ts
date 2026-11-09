import type { ModelTier, ReasoningPreference } from "../src/shared.ts";

export const TIERS: ModelTier[] = ["fast", "balanced", "heavy"];
const RANK: Record<ModelTier, number> = { fast: 0, balanced: 1, heavy: 2 };

export interface RouterResult {
  id: string;
  expectedTier: ModelTier;
  expectedReasoning: ReasoningPreference;
  /** null when the call failed. */
  predictedTier: ModelTier | null;
  predictedReasoning: ReasoningPreference | null;
  /** Model the router would actually pick from the candidate list (provider/id). */
  selectedModel: string | null;
  /** Tier of the selected model per classifyModelTier. */
  selectedTier: ModelTier | null;
  confidence: number | null;
  ms: number;
  ok: boolean;
}

export interface RouterMetrics {
  total: number;
  errors: number;
  tierAccuracy: number;
  withinOneAccuracy: number;
  /** Predicted a more expensive tier than needed (wasted cost). */
  overProvisioned: number;
  /** Predicted a weaker tier than needed (quality risk, worse than over). */
  underProvisioned: number;
  reasoningAccuracy: number;
  /** Fraction where the finally selected model sits in the expected tier. */
  selectionAccuracy: number;
  confusion: Record<ModelTier, Record<ModelTier, number>>;
  perTier: Record<ModelTier, { total: number; correct: number; accuracy: number }>;
  p50Ms: number;
  p95Ms: number;
  meanConfidence: number;
  misrouted: Array<{ id: string; expected: ModelTier; predicted: ModelTier; confidence: number | null }>;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

export function computeRouterMetrics(results: RouterResult[]): RouterMetrics {
  const valid = results.filter((r) => r.ok && r.predictedTier !== null);
  const confusion = {} as RouterMetrics["confusion"];
  const perTier = {} as RouterMetrics["perTier"];
  for (const t of TIERS) {
    confusion[t] = { fast: 0, balanced: 0, heavy: 0 };
    perTier[t] = { total: 0, correct: 0, accuracy: 0 };
  }

  let exact = 0;
  let within = 0;
  let over = 0;
  let under = 0;
  let reasonOk = 0;
  let selOk = 0;
  let selN = 0;
  let confSum = 0;
  let confN = 0;
  const misrouted: RouterMetrics["misrouted"] = [];

  for (const r of valid) {
    const predicted = r.predictedTier as ModelTier;
    confusion[r.expectedTier][predicted] += 1;
    perTier[r.expectedTier].total += 1;
    const diff = RANK[predicted] - RANK[r.expectedTier];
    if (diff === 0) {
      exact += 1;
      perTier[r.expectedTier].correct += 1;
    } else {
      misrouted.push({ id: r.id, expected: r.expectedTier, predicted, confidence: r.confidence });
    }
    if (Math.abs(diff) <= 1) within += 1;
    if (diff > 0) over += 1;
    if (diff < 0) under += 1;
    if (r.predictedReasoning === r.expectedReasoning) reasonOk += 1;
    if (r.selectedTier) {
      selN += 1;
      if (r.selectedTier === r.expectedTier) selOk += 1;
    }
    if (typeof r.confidence === "number") {
      confSum += r.confidence;
      confN += 1;
    }
  }
  for (const t of TIERS) {
    perTier[t].accuracy = perTier[t].total ? perTier[t].correct / perTier[t].total : 0;
  }

  const n = valid.length || 1;
  const ms = valid.map((r) => r.ms).sort((a, b) => a - b);
  return {
    total: results.length,
    errors: results.length - valid.length,
    tierAccuracy: exact / n,
    withinOneAccuracy: within / n,
    overProvisioned: over / n,
    underProvisioned: under / n,
    reasoningAccuracy: reasonOk / n,
    selectionAccuracy: selN ? selOk / selN : 0,
    confusion,
    perTier,
    p50Ms: percentile(ms, 0.5),
    p95Ms: percentile(ms, 0.95),
    meanConfidence: confN ? confSum / confN : 0,
    misrouted,
  };
}
