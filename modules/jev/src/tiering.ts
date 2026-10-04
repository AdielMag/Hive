/**
 * Turns Jev's raw signals plus context usage and prompt-cache age into one of four compaction tiers.
 * Pure on purpose: Jev only answers "what is going on", this code decides what to do about it.
 */
import type { JevAdvice } from "./shared.ts";

export type CompactTier = "silent" | "notice" | "recommend" | "request";

/** Anthropic's default prompt-cache lifetime; once idle past it, compacting costs almost nothing extra. */
export const CACHE_TTL_MS = 5 * 60_000;
/** Probability above which a yes/no signal counts as "yes". */
export const YES = 0.7;
/** Below this many tokens a summary can't save anything meaningful. */
export const MIN_TOKENS = 8_000;

export interface TierInput {
  advice: JevAdvice;
  /** Idle milliseconds since the advice was computed (the last response). */
  idleMs: number;
  floorPct: number;
}

export interface TierResult {
  tier: CompactTier;
  score: number;
  /** Short human reasons, in display order. */
  reasons: string[];
}

export function decideTier({ advice, idleMs, floorPct }: TierInput): TierResult {
  const { usagePct, tokens, signals } = advice;
  const silent: TierResult = { tier: "silent", score: 0, reasons: [] };
  if (tokens < MIN_TOKENS || usagePct < floorPct) return silent;
  // Never interrupt a half-finished multi-step job: the summary would drop the details it needs.
  if (signals.midOperation > 0.5) return silent;

  const switched = signals.switchedGears > YES;
  const finished = signals.atBoundary > YES;
  const boundary = switched || finished;
  const cacheCold = idleMs >= CACHE_TTL_MS;
  const needsLittle = signals.needsHistory < 0.7;

  const reasons: string[] = [];
  let score = usagePct / 100;
  if (switched) reasons.push("you moved on to a new task");
  else if (finished) reasons.push("that task looks finished");
  if (boundary) score += 0.15;
  if (cacheCold) {
    reasons.push("prompt cache expired, so compacting is cheap now");
    score += 0.1;
  }
  if (needsLittle) {
    reasons.push("next step needs little of the earlier chat");
    score += 0.1;
  }

  // Without a task boundary, only ever nudge: Pi's own threshold stays the safety net.
  if (!boundary) return score >= 0.5 ? { tier: "notice", score, reasons } : silent;
  if (score >= 0.85) return { tier: "request", score, reasons };
  if (score >= 0.65) return { tier: "recommend", score, reasons };
  if (score >= 0.5) return { tier: "notice", score, reasons };
  return silent;
}
