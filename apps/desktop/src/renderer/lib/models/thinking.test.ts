import { describe, expect, it } from "vitest";
import {
  clampThinkingLevel,
  formatContextWindow,
  getSupportedThinkingLevels,
} from "./thinking.ts";

describe("getSupportedThinkingLevels", () => {
  it("returns ['off'] for null/undefined or non-reasoning models", () => {
    expect(getSupportedThinkingLevels(null)).toEqual(["off"]);
    expect(getSupportedThinkingLevels(undefined)).toEqual(["off"]);
    expect(getSupportedThinkingLevels({ reasoning: false })).toEqual(["off"]);
    expect(getSupportedThinkingLevels({ id: "gpt-4o", reasoning: false })).toEqual(["off"]);
  });

  it("returns default reasoning levels when reasoning is true but thinkingLevelMap is absent", () => {
    expect(getSupportedThinkingLevels({ reasoning: true })).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
    ]);
  });

  it("handles antigravity / gemini-3.8-flash (no off, low..high only)", () => {
    const gemini = {
      id: "gemini-3.8-flash",
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: null,
        max: null,
      },
    };
    expect(getSupportedThinkingLevels(gemini)).toEqual(["low", "medium", "high"]);
  });

  it("handles antigravity / claude-sonnet-4-6 (high only)", () => {
    const claude = {
      id: "claude-sonnet-4-6",
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: null,
        medium: null,
        high: "high",
        xhigh: null,
        max: null,
      },
    };
    expect(getSupportedThinkingLevels(claude)).toEqual(["high"]);
  });

  it("handles anthropic / claude-opus-5-5 (low..max)", () => {
    const opus = {
      id: "claude-opus-5-5",
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
        max: "max",
      },
    };
    expect(getSupportedThinkingLevels(opus)).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  it("handles anthropic / claude-sonnet-5 (includes max)", () => {
    const sonnet = {
      id: "claude-sonnet-5",
      reasoning: true,
      thinkingLevelMap: { xhigh: "xhigh", max: "max" },
    };
    expect(getSupportedThinkingLevels(sonnet)).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });
});

describe("clampThinkingLevel", () => {
  it("clamps non-reasoning model to 'off'", () => {
    const gpt4o = { reasoning: false };
    expect(clampThinkingLevel(gpt4o, "high")).toBe("off");
    expect(clampThinkingLevel(gpt4o, "off")).toBe("off");
  });

  it("clamps 'off' to lowest available level for Gemini (low)", () => {
    const gemini = {
      id: "gemini-3.8-flash",
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: null,
        max: null,
      },
    };
    expect(clampThinkingLevel(gemini, "off")).toBe("low");
    expect(clampThinkingLevel(gemini, "minimal")).toBe("low");
    expect(clampThinkingLevel(gemini, "medium")).toBe("medium");
    expect(clampThinkingLevel(gemini, "max")).toBe("high");
  });

  it("clamps any level to 'high' for claude-sonnet-4-6 (antigravity)", () => {
    const claude = {
      id: "claude-sonnet-4-6",
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: null,
        medium: null,
        high: "high",
        xhigh: null,
        max: null,
      },
    };
    expect(clampThinkingLevel(claude, "off")).toBe("high");
    expect(clampThinkingLevel(claude, "low")).toBe("high");
    expect(clampThinkingLevel(claude, "high")).toBe("high");
  });
});

describe("formatContextWindow", () => {
  it("formats token counts properly", () => {
    expect(formatContextWindow(1_048_576)).toBe("1M");
    expect(formatContextWindow(1_000_000)).toBe("1M");
    expect(formatContextWindow(2_000_000)).toBe("2M");
    expect(formatContextWindow(250_000)).toBe("250k");
    expect(formatContextWindow(200_000)).toBe("200k");
    expect(formatContextWindow(128_000)).toBe("128k");
    expect(formatContextWindow(0)).toBe("");
    expect(formatContextWindow(undefined)).toBe("");
  });
});
