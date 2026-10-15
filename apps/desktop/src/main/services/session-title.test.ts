import { describe, expect, it } from "vitest";
import { cleanSessionTitle } from "./session-title.ts";

describe("cleanSessionTitle", () => {
  it("strips quotes, prefixes, markdown and trailing punctuation", () => {
    expect(cleanSessionTitle('"Fix login redirect bug."')).toBe("Fix login redirect bug");
    expect(cleanSessionTitle("Title: **Add dark mode**")).toBe("Add dark mode");
    expect(cleanSessionTitle("```\nRefactor store\n```")).toBe("Refactor store");
  });
  it("uses first non-empty line and caps length", () => {
    expect(cleanSessionTitle("\n\nFirst line\nsecond")).toBe("First line");
    expect(cleanSessionTitle("x".repeat(100)).length).toBe(50);
  });
  it("returns empty for blank output", () => {
    expect(cleanSessionTitle("  \n ")).toBe("");
  });
});
