import { describe, expect, it } from "vitest";
import {
  ARC_PRESETS,
  DEFAULT_ARC_THEME,
  arcColorFromCss,
  buildArcTokens,
  getContrastRatio,
  resolveMode,
  sanitizeArcTheme,
} from "../src/index.ts";

describe("Arc theme tokens", () => {
  it("resolves auto mode from the system preference", () => {
    expect(resolveMode("auto", true)).toBe("dark");
    expect(resolveMode("auto", false)).toBe("light");
    expect(resolveMode("light", true)).toBe("light");
  });

  it.each(ARC_PRESETS.flatMap((p) => [0, 0.5, 1].map((i) => [p.id, i] as const)))(
    "preset %s @ intensity %s keeps text readable on content and frame",
    (id, intensity) => {
      const theme = { ...ARC_PRESETS.find((p) => p.id === id)!.theme, intensity };
      const { vars } = buildArcTokens(theme, true);
      expect(getContrastRatio(vars["--text-primary"]!, vars["--bg-app"]!)).toBeGreaterThanOrEqual(7);
      expect(getContrastRatio(vars["--text-secondary"]!, vars["--bg-app"]!)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(vars["--frame-text"]!, vars["--frame-base"]!)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(vars["--accent-contrast"]!, vars["--accent-base"]!)).toBeGreaterThanOrEqual(3);
    },
  );

  it("emits a multi-stop gradient for multi-colour themes", () => {
    const { vars } = buildArcTokens({ ...DEFAULT_ARC_THEME, colors: [{ hue: 0, sat: 1 }, { hue: 120, sat: 1 }, { hue: 240, sat: 1 }] });
    expect(vars["--frame-gradient"]).toMatch(/linear-gradient\(135deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 50%, #[0-9a-f]{6} 100%\)/);
  });

  it("sanitizes untrusted persisted data", () => {
    const t = sanitizeArcTheme({ colors: [{ hue: 400, sat: 3 }, null, { hue: 1, sat: 0 }, { hue: 2, sat: 0 }, { hue: 3, sat: 0 }], mode: "nope", grain: "x" });
    expect(t.colors).toHaveLength(3);
    expect(t.colors[0]).toEqual({ hue: 40, sat: 1 });
    expect(t.mode).toBe(DEFAULT_ARC_THEME.mode);
    expect(t.grain).toBe(DEFAULT_ARC_THEME.grain);
    expect(sanitizeArcTheme(undefined)).toEqual(DEFAULT_ARC_THEME);
  });

  it("maps CSS colours back onto the pad", () => {
    const c = arcColorFromCss("#3b82f6")!;
    expect(c.hue).toBeGreaterThan(240);
    expect(c.hue).toBeLessThan(275);
    expect(c.sat).toBeGreaterThan(0.5);
    expect(arcColorFromCss("not a colour")).toBeNull();
  });

  it("default theme matches Honey preset and icon color range", () => {
    const honeyPreset = ARC_PRESETS.find((p) => p.id === "honey");
    expect(honeyPreset).toBeDefined();
    expect(DEFAULT_ARC_THEME).toEqual(honeyPreset!.theme);
    expect(DEFAULT_ARC_THEME.colors[0]!.hue).toBeGreaterThanOrEqual(60);
    expect(DEFAULT_ARC_THEME.colors[0]!.hue).toBeLessThanOrEqual(75);
  });
});
