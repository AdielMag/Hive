import { describe, expect, it } from "vitest";
import {
  classifyModelTier,
  extractRouterDecisions,
  filterRealCandidates,
  routeTaskLocally,
  selectModelForTier,
} from "./router.ts";
import type { CandidateModel } from "./shared.ts";

describe("router", () => {
  const flash: CandidateModel = {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    cost: { input: 0.15 },
  };
  const sonnet: CandidateModel = {
    id: "claude-3-7-sonnet",
    name: "Claude 3.7 Sonnet",
    provider: "anthropic",
    cost: { input: 3.0 },
  };
  const opus: CandidateModel = {
    id: "claude-opus-4-6",
    name: "Claude Opus",
    provider: "anthropic",
    cost: { input: 15.0 },
  };
  const autoJev: CandidateModel = {
    id: "auto",
    name: "Auto (Jev)",
    provider: "jev",
  };

  const geminiPro: CandidateModel = {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
  };
  const minimax: CandidateModel = {
    id: "minimax-01",
    name: "MiniMax 01",
    provider: "minimax",
  };
  const zeroCost: CandidateModel = {
    id: "custom-coding-model",
    name: "Custom Model",
    provider: "subscription",
    cost: { input: 0 },
  };

  it("classifies models into tiers by name pattern or pricing", () => {
    expect(classifyModelTier(flash)).toBe("fast");
    expect(classifyModelTier(sonnet)).toBe("balanced");
    expect(classifyModelTier(opus)).toBe("heavy");

    // gemini-pro must NOT be classified as fast because of "mini" in gemini
    expect(classifyModelTier(geminiPro)).toBe("balanced");
    // minimax must not trigger mini
    expect(classifyModelTier(minimax)).toBe("balanced");
    // zero cost must not trigger fast tier (<1.0)
    expect(classifyModelTier(zeroCost)).toBe("balanced");
  });

  it("filters out synthetic auto-jev model", () => {
    const filtered = filterRealCandidates([autoJev, flash, sonnet]);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.id)).toEqual(["gemini-2.5-flash", "claude-3-7-sonnet"]);
  });

  it("selects model for tier with fallback", () => {
    const candidates = [flash, sonnet, opus];
    expect(selectModelForTier("fast", candidates)?.id).toBe("gemini-2.5-flash");
    expect(selectModelForTier("balanced", candidates)?.id).toBe("claude-3-7-sonnet");
    expect(selectModelForTier("heavy", candidates)?.id).toBe("claude-opus-4-6");

    // Fallback when fast is missing
    const noFast = [sonnet, opus];
    expect(selectModelForTier("fast", noFast)?.id).toBe("claude-3-7-sonnet");

    // Fallback when heavy is missing
    const noHeavy = [flash, sonnet];
    expect(selectModelForTier("heavy", noHeavy)?.id).toBe("claude-3-7-sonnet");

    // Returns null when no candidates
    expect(selectModelForTier("fast", [])).toBeNull();
  });

  it("extracts typed decisions from answers", () => {
    const res = extractRouterDecisions({
      tier: { choice: "heavy", confidence: 0.92 },
      reasoning: { choice: "high" },
    });
    expect(res.tier).toBe("heavy");
    expect(res.confidence).toBe(0.92);
    expect(res.reasoning).toBe("high");
  });

  it("handles offline heuristic routing", () => {
    const candidates = [flash, sonnet, opus];
    const fastRes = routeTaskLocally("search for foo in src/bar.ts", candidates);
    expect(fastRes.tier).toBe("fast");
    expect(fastRes.model.id).toBe("gemini-2.5-flash");

    const heavyRes = routeTaskLocally("architect and redesign entire authentication system", candidates);
    expect(heavyRes.tier).toBe("heavy");
    expect(heavyRes.model.id).toBe("claude-opus-4-6");
  });
});
