import { describe, expect, it } from "vitest";
import { generateTheme, getContrastRatio, meetsWcagAA, tokensToCssVars } from "../src/index.ts";

describe("Theme Engine", () => {
  it("computes accurate contrast ratios", () => {
    // Black and white is 21:1
    const bw = getContrastRatio("#000000", "#ffffff");
    expect(bw).toBeCloseTo(21, 0);

    // Identical colors is 1:1
    const same = getContrastRatio("#539bf5", "#539bf5");
    expect(same).toBeCloseTo(1, 0);
  });

  it("generates dark mode theme meeting WCAG AA contrast for text", () => {
    const theme = generateTheme({
      colors: ["#539bf5"],
      intensity: 0.5,
      grain: 0.1,
      mode: "dark",
    });

    expect(theme.bgApp).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.textPrimary).toBeDefined();

    // Verify WCAG AA compliance
    const isAA = meetsWcagAA(theme.textPrimary, theme.bgApp);
    expect(isAA).toBe(true);

    const ratio = getContrastRatio(theme.textPrimary, theme.bgApp);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("generates light mode theme meeting WCAG AA contrast for text", () => {
    const theme = generateTheme({
      colors: ["#f778ba"],
      intensity: 0.6,
      grain: 0.05,
      mode: "light",
    });

    const ratio = getContrastRatio(theme.textPrimary, theme.bgApp);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("creates CSS variables map", () => {
    const theme = generateTheme({
      colors: ["#539bf5", "#986ee2"],
      intensity: 0.4,
      grain: 0.1,
      mode: "dark",
    });

    const vars = tokensToCssVars(theme);
    expect(vars["--bg-app"]).toBe(theme.bgApp);
    expect(vars["--accent-base"]).toBe(theme.accentBase);
  });
});
