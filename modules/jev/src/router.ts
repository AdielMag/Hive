import type { CandidateModel, ModelTier, ReasoningPreference, RouteTaskResult } from "./shared.ts";

export const ROUTER_QUESTIONS = {
  tier: {
    type: "choice" as const,
    instructions:
      "Which model capability tier does this coding task need? Judge the DIFFICULTY and the COST OF A WRONG ANSWER, not the length of the message. " +
      "The input holds the new user message and, when present, the recent conversation; use the conversation only to understand short follow-ups such as 'yes' or 'go ahead'. " +
      "Prefer the weakest tier that will reliably do the job, but never under-serve hard or risky work.",
    criteria: {
      fast: "Trivial and fully specified: lookups, status checks, listing or reading files, a typo or rename, a purely mechanical edit (even across many files), formatting, simple git operations such as commit or delete a branch, a greeting, or explaining a basic concept.",
      balanced: "Ordinary engineering with a clear scope: implementing a feature or endpoint, writing standard unit tests, fixing an ordinary bug or an error from a stack trace, refactoring one module, resolving merge conflicts, writing docs, code review, or adding retry, logging or a flag.",
      heavy: "Hard or high-stakes work where a wrong answer is costly: vague or open-ended 'why is it broken' or 'make it much faster' problems, root-causing races, deadlocks, memory leaks or flaky behaviour, architecture and system design, data migrations, non-trivial algorithms and concurrency or sync logic, security, authentication or cryptography (even when the change is small), property-based or formal verification, large new features, and performance profiling and optimisation. If unsure between balanced and heavy for risky or ambiguous work, choose heavy.",
    },
  },
  reasoning: {
    type: "choice" as const,
    instructions: "Does this task benefit from extended internal reasoning/thinking before acting?",
    criteria: {
      off: "Direct, mechanical task with obvious steps; extended thinking is unnecessary.",
      low: "Ordinary implementation or debugging that benefits from brief planning.",
      high: "Hard problem: tricky edge cases, subtle correctness or security concerns, deep debugging, or architectural tradeoffs that need extensive reasoning.",
    },
  },
};

/** Build the `state` sent to Jev: the new message plus (optionally) a short transcript tail for follow-ups. */
export function buildRouterState(task: string, context?: string): string | { recent_conversation: string; new_user_message: string } {
  const message = (task || "").slice(0, 4_000);
  const ctx = (context || "").trim().slice(-1_500);
  return ctx ? { recent_conversation: ctx, new_user_message: message } : message;
}

/** Classify a model into fast, balanced, or heavy based on id, name, and input pricing. */
export function classifyModelTier(model: CandidateModel): ModelTier {
  const id = (model.id || "").toLowerCase();
  const name = (model.name || "").toLowerCase();
  const text = `${model.provider || ""}/${id} ${name}`;

  // Check heavy tier first: opus, o-series, r1/reasoner, gpt-*-pro, kimi thinking
  if (
    /\b(opus|heavy|deepseek-r1|deepseek-reasoner)\b/i.test(text) ||
    /(^|[-_ /])(o1|o3|o4|r1)([-_ /]|$)/i.test(id) ||
    /(^|[-_ /])(gpt|o\d)[\w.]*-pro\b/i.test(id) ||
    /kimi-k\d+(\.\d+)?-thinking/i.test(id)
  ) {
    return "heavy";
  }

  // Check fast tier: flash, haiku, discrete mini/small (avoiding "gemini" and "minimax")
  const isMini = /(^|[-_ /])(mini|small)([-_ /]|$)/i.test(id) && !/(gemini|minimax)/i.test(id);
  const isFlashOrHaiku = /\b(flash|haiku|instant|nano|lite|fast)\b/i.test(text);
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
  // Balanced tier: the task needs real capability, so prefer the strongest (priciest) model that is not heavy.
  grouped.balanced.sort((a, b) => (b.cost?.input ?? 0) - (a.cost?.input ?? 0) || (b.contextWindow ?? 0) - (a.contextWindow ?? 0));
  // Heavy tier: prefer reasoning enabled, then the most capable (priciest), then larger context window
  grouped.heavy.sort(
    (a, b) =>
      (b.reasoning ? 1 : 0) - (a.reasoning ? 1 : 0) ||
      (b.cost?.input ?? 0) - (a.cost?.input ?? 0) ||
      (b.contextWindow ?? 0) - (a.contextWindow ?? 0),
  );

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

/** Below this confidence a "fast" verdict is promoted to balanced: under-serving a task costs more than over-serving it. */
export const LOW_CONFIDENCE = 0.7;

const TIER_MIN_REASONING: Record<ModelTier, ReasoningPreference> = { fast: "off", balanced: "low", heavy: "high" };
const REASONING_RANK: Record<ReasoningPreference, number> = { off: 0, low: 1, medium: 2, high: 3 };

/**
 * Jev's raw answers + the safety policy used in production: promote the tier when Jev is unsure, and never
 * let the thinking level sit below what the final tier warrants.
 */
export function resolveRouterDecision(answers: Record<string, any> | undefined | null): {
  tier: ModelTier;
  reasoning: ReasoningPreference;
  confidence: number;
  rawTier: ModelTier;
} {
  const raw = extractRouterDecisions(answers);
  let tier = raw.tier;
  if (tier === "fast" && raw.confidence < LOW_CONFIDENCE) tier = "balanced";
  const floor = TIER_MIN_REASONING[tier];
  const reasoning = REASONING_RANK[raw.reasoning] >= REASONING_RANK[floor] ? raw.reasoning : floor;
  return { tier, reasoning, confidence: raw.confidence, rawTier: raw.tier };
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
