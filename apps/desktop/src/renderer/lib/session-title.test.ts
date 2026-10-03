import { describe, expect, it } from "vitest";
import { sessionDisplayTitle, titleFromPrompt } from "./session-title.ts";

describe("titleFromPrompt", () => {
  it("strips the Studio mode prefix and collapses whitespace", () => {
    expect(titleFromPrompt("[Mode: Plan - Analyze, research.]\n\nFix the   tab\ntitle")).toBe("Fix the tab title");
    expect(titleFromPrompt("[Mode: Ask - Answer questions, explain concepts, and analyze code. Do not edit files or execute destructive actions.]\n\nExplain the architecture")).toBe("Explain the architecture");
  });

  it("drops attached file blocks", () => {
    expect(titleFromPrompt("Review this\n\n--- Attached File: a.ts ---\nconst x = 1;\n--- End of File ---")).toBe("Review this");
  });

  it("truncates with an ellipsis", () => {
    const t = titleFromPrompt("a".repeat(100), 20);
    expect(t).toHaveLength(20);
    expect(t.endsWith("…")).toBe(true);
  });

  it("returns empty for empty input", () => {
    expect(titleFromPrompt("")).toBe("");
    expect(titleFromPrompt(undefined)).toBe("");
  });
});

describe("sessionDisplayTitle", () => {
  it("prefers user title, then Pi name, then first message", () => {
    expect(sessionDisplayTitle({ title: "Mine", name: "Pi", firstMessage: "hello" })).toBe("Mine");
    expect(sessionDisplayTitle({ name: "Pi", firstMessage: "hello" })).toBe("Pi");
    expect(sessionDisplayTitle({ firstMessage: "[Mode: Debug - x]\n\nhello" })).toBe("hello");
  });
});
