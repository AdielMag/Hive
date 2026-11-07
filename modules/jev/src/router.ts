import type { CandidateModel, ModelTier, ReasoningPreference, RouteTaskResult } from "./shared.ts";

export const ROUTER_QUESTIONS = {
  tier: {
    type: "choice" as const,
    instructions: "Which capability tier is best suited to execute this coding/development task effectively and cost-efficiently?",
    criteria: {
      fast: "Simple query, small single-line edit, quick lookup, formatting, status triage, simple command, or routine explanation that does not require deep analysis.",
      balanced: "Standard coding task, feature implementation, refactoring, writing unit tests, debugging ordinary issues, code review, or multi-step workflow.",
      heavy: "Deep architectural design, very difficult bug diagnosis, complex algorithm implementation, high-stakes system restructuring, or difficult multi-step problem solving.",
    },
  },
  reasoning: {
    type: "choice" as const,
    instructions: "Does this task require extended internal reasoning/thinking?",
    criteria: {
      off: "Direct, straightforward task with obvious steps; extended thinking is unnecessary.",
      low: "Moderate complexity task benefiting from brief internal reasoning.",
      high: "Complex problem, tricky edge cases, deep debugging, or architectural tradeoffs requiring extensive reasoning.",
    },
  },
};

/** Classify a model into fast, balanced, or heavy based on id, name, and input pricing. */
export function classifyModelTier(model: CandidateModel): ModelTier {
  const id = (model.id || "").toLowerCase();
  const name = (model.name || "").toLowerCase();
  const text = `${model.provider || ""}/${id} ${name}`;

  // Check heavy tier first: opus, o1, o3, r1, deepseek-r1
  if (
    /\b(opus|heavy|deepseek-r1)\b/i.test(text) ||
    /(^|[-_ /])(o1|o3|r1)([-_ /]|$)/i.test(id)
  ) {
    return "heavy";
  }

  // Check fast tier: flash, haiku, discrete mini/small (avoiding "gemini" and "minimax")
  const isMini = /(^|[-_ /])(mini|small)([-_ /]|$)/i.test(id) && !/(gemini|minimax)/i.test(id);
  const isFlashOrHaiku = /\b(flash|haiku|instant|nano|lite)\b/i.test(text);
  if (isMini || isFlashOrHaiku) {
    return "fast";
  }

  // Cost check only if non-zero
  const cost = model.cost?.input;
  if (typeof cost === "number" && Number.isFinite(cost) && cost > 0) {
    if (cost < 1.0) return "fast";
    if (cost >= 5.0) return "heavy";
  }

  return "balanced";
}

export function filterRealCandidates(candidates: CandidateModel[] = []): CandidateModel[] {
  return candidates.filter((m) => {
    if (!m || !m.id || !m.provider) return false;
    if (m.provider === "jev" && m.id === "auto") return false;
    if (m.provider === "jev" && (m.id === "auto-jev" || m.id === "jev-auto")) return false;
    return true;
  });
}

/**
 * Select the best candidate model matching the desired tier, with graceful fallbacks.
 * Returns null if candidates array is empty.
 */
export function selectModelForTier(
  tier: ModelTier,
  rawCandidates: CandidateModel[] = [],
  preferredProvider?: string,
): CandidateModel | null {
  const candidates = filterRealCandidates(rawCandidates);

  if (candidates.length === 0) {
    return null;
  }

  const grouped: Record<ModelTier, CandidateModel[]> = {
    fast: [],
    balanced: [],
    heavy: [],
  };

  for (const m of candidates) {
    grouped[classifyModelTier(m)].push(m);
  }

  // Sort inside tiers:
  // Fast tier: prefer lowest input cost if known
  grouped.fast.sort((a, b) => (a.cost?.input ?? 999) - (b.cost?.input ?? 999));
  // Heavy tier: prefer reasoning enabled, then larger context window
  grouped.heavy.sort((a, b) => (b.reasoning ? 1 : 0) - (a.reasoning ? 1 : 0) || (b.contextWindow ?? 0) - (a.contextWindow ?? 0));

  const fallbackOrder: Record<ModelTier, ModelTier[]> = {
    fast: ["fast", "balanced", "heavy"],
    balanced: ["balanced", "heavy", "fast"],
    heavy: ["heavy", "balanced", "fast"],
  };

  for (const target of fallbackOrder[tier]) {
    const list = grouped[target];
    if (list.length > 0 && list[0]) {
      if (preferredProvider) {
        const pref = list.find((m) => m.provider.toLowerCase() === preferredProvider.toLowerCase());
        if (pref) return pref;
      }
      return list[0];
    }
  }

  return candidates[0] ?? null;
}

/** Parses Jev raw answers into clean typed router decisions. */
export function extractRouterDecisions(answers: Record<string, any> | undefined | null): {
  tier: ModelTier;
  reasoning: ReasoningPreference;
  confidence: number;
} {
  const tierAns = answers?.tier;
  const reasoningAns = answers?.reasoning;

  let tier: ModelTier = "balanced";
  let confidence = 0.8;

  if (tierAns && typeof tierAns === "object") {
    const choice = String(tierAns.choice || "").toLowerCase();
    if (choice === "fast" || choice === "heavy" || choice === "balanced") {
      tier = choice;
    }
    if (typeof tierAns.confidence === "number" && Number.isFinite(tierAns.confidence)) {
      confidence = Math.max(0, Math.min(1, tierAns.confidence));
    }
  }

  let reasoning: ReasoningPreference = "off";
  if (reasoningAns && typeof reasoningAns === "object") {
    const rChoice = String(reasoningAns.choice || "").toLowerCase();
    if (rChoice === "low" || rChoice === "high" || rChoice === "off") {
      reasoning = rChoice;
    }
  }

  return { tier, reasoning, confidence };
}

/** Heuristic offline fallback when Jev is unavailable or unconfigured. */
export function routeTaskLocally(
  task: string,
  candidates: CandidateModel[] = [],
  preferredProvider?: string,
): RouteTaskResult {
  const text = (task || "").toLowerCase();
  let tier: ModelTier = "balanced";
  let reasoning: ReasoningPreference = "off";

  const isLookup = /\b(search|find|grep|locate|where is|list files?|check status|git status|pwd|cat)\b/i.test(text);
  const isComplex = /\b(architect|refactor entire|redesign|deep bug|hard bug|root cause|concurrency|race condition)\b/i.test(text);

  if (isLookup && !isComplex) {
    tier = "fast";
  } else if (isComplex) {
    tier = "heavy";
    reasoning = "high";
  }

  const model = selectModelForTier(tier, candidates, preferredProvider);

  if (!model) {
    return {
      ok: false,
      tier,
      reasoning,
      confidence: 0,
      model: { id: "default", provider: "default" },
      error: "No candidate models available",
    };
  }

  return {
    ok: true,
    tier,
    reasoning,
    confidence: 0.75,
    model: { id: model.id, provider: model.provider, name: model.name },
    reason: `Heuristic route to ${tier} tier`,
  };
}
