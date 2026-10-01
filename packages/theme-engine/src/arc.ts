/**
 * Arc-style theming.
 *
 * Arc models a theme as up to three colour "dots" on a hue/saturation pad (angle = hue, distance from the
 * centre = saturation), a light/dark/auto mode, an intensity slider (washed-out tint -> deep colour) and a
 * grain amount. The window *frame* (sidebars, title bar) becomes a gradient of those colours with film grain,
 * while the content area floats above it as a calm, slightly tinted card. Everything here is pure and
 * deterministic so it can be unit-tested and applied before first paint.
 */
import { formatHex, oklch, parse } from "culori";
import { getContrastRatio } from "./contrast.ts";

export interface ArcColor {
  /** 0..360, OKLCH hue. 0 sits at the top of the pad, increasing clockwise. */
  hue: number;
  /** 0..1, distance from the centre of the pad (0 = greyscale). */
  sat: number;
}

export type ArcMode = "light" | "dark" | "auto";

export interface ArcTheme {
  colors: ArcColor[];
  mode: ArcMode;
  /** 0..1: low = soft tint, high = rich, saturated frame. */
  intensity: number;
  /** 0..1: amount of film grain on the frame. */
  grain: number;
}

export const MAX_ARC_COLORS = 3;

export const DEFAULT_ARC_THEME: ArcTheme = {
  colors: [{ hue: 265, sat: 0.55 }],
  mode: "dark",
  intensity: 0.55,
  grain: 0.35,
};

export interface ArcPreset {
  id: string;
  name: string;
  theme: ArcTheme;
}

const preset = (id: string, name: string, colors: ArcColor[], mode: ArcMode = "dark", intensity = 0.6, grain = 0.35): ArcPreset => ({
  id,
  name,
  theme: { colors, mode, intensity, grain },
});

export const ARC_PRESETS: ArcPreset[] = [
  preset("midnight", "Midnight", [{ hue: 265, sat: 0.55 }]),
  preset("ember", "Ember", [{ hue: 30, sat: 0.8 }, { hue: 350, sat: 0.7 }]),
  preset("lagoon", "Lagoon", [{ hue: 200, sat: 0.7 }, { hue: 170, sat: 0.6 }]),
  preset("matcha", "Matcha", [{ hue: 140, sat: 0.5 }], "dark", 0.45),
  preset("aurora", "Aurora", [{ hue: 300, sat: 0.7 }, { hue: 200, sat: 0.75 }, { hue: 150, sat: 0.6 }]),
  preset("rose", "Rosé", [{ hue: 355, sat: 0.55 }, { hue: 20, sat: 0.4 }], "dark", 0.5),
  preset("graphite", "Graphite", [{ hue: 250, sat: 0.06 }], "dark", 0.4, 0.25),
  preset("sunrise", "Sunrise", [{ hue: 60, sat: 0.6 }, { hue: 15, sat: 0.65 }], "light", 0.55),
  preset("glacier", "Glacier", [{ hue: 220, sat: 0.45 }], "light", 0.45),
  preset("paper", "Paper", [{ hue: 80, sat: 0.08 }], "light", 0.35, 0.3),
];

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const wrapHue = (h: number) => ((h % 360) + 360) % 360;

function hex(l: number, c: number, h: number): string {
  return formatHex({ mode: "oklch", l: clamp01(l), c: Math.max(0, c), h: wrapHue(h) });
}

function rgbTriplet(hexColor: string): string {
  const v = hexColor.replace("#", "");
  return `${parseInt(v.slice(0, 2), 16)}, ${parseInt(v.slice(2, 4), 16)}, ${parseInt(v.slice(4, 6), 16)}`;
}

export function resolveMode(mode: ArcMode, systemPrefersDark: boolean): "light" | "dark" {
  return mode === "auto" ? (systemPrefersDark ? "dark" : "light") : mode;
}

/** The vivid "ink" of a dot as displayed on the pad / swatches. */
export function arcDotColor(color: ArcColor): string {
  return hex(0.72, 0.02 + clamp01(color.sat) * 0.17, color.hue);
}

/** Frame colour for one dot, honouring mode and intensity. */
export function arcFrameColor(color: ArcColor, dark: boolean, intensity: number): string {
  const i = clamp01(intensity);
  const s = clamp01(color.sat);
  if (dark) {
    // soft tint (L .34, low chroma) -> deep jewel tone (L .24, rich chroma)
    return hex(0.35 - i * 0.12, s * (0.035 + i * 0.12), color.hue);
  }
  // pastel wash (L .95) -> saturated light colour (L .80)
  return hex(0.955 - i * 0.15, s * (0.02 + i * 0.12), color.hue);
}

export function arcFrameGradient(theme: ArcTheme, dark: boolean): string {
  const colors = (theme.colors.length ? theme.colors : DEFAULT_ARC_THEME.colors).slice(0, MAX_ARC_COLORS);
  const stops = colors.map((c) => arcFrameColor(c, dark, theme.intensity));
  if (stops.length === 1) {
    const c = colors[0]!;
    const lifted = arcFrameColor({ hue: c.hue + 12, sat: c.sat }, dark, Math.max(0, theme.intensity - 0.18));
    return `linear-gradient(155deg, ${lifted} 0%, ${stops[0]} 70%)`;
  }
  if (stops.length === 2) return `linear-gradient(135deg, ${stops[0]} 0%, ${stops[1]} 100%)`;
  return `linear-gradient(135deg, ${stops[0]} 0%, ${stops[1]} 50%, ${stops[2]} 100%)`;
}

/** Blend of all frame colours, used for contrast decisions on the frame. */
function frameAverage(theme: ArcTheme, dark: boolean): string {
  const parsed = theme.colors.map((c) => oklch(arcFrameColor(c, dark, theme.intensity))!);
  if (!parsed.length) return dark ? "#1b1d24" : "#eef0f4";
  const l = parsed.reduce((a, p) => a + (p.l ?? 0), 0) / parsed.length;
  const c = parsed.reduce((a, p) => a + (p.c ?? 0), 0) / parsed.length;
  return hex(l, c, theme.colors[0]!.hue);
}

/** Pick the first candidate reaching `min` contrast against `bg`, else the best one. */
function solveText(bg: string, candidates: string[], min: number): string {
  let best = candidates[0]!;
  let bestRatio = 0;
  for (const c of candidates) {
    const r = getContrastRatio(c, bg);
    if (r >= min) return c;
    if (r > bestRatio) {
      best = c;
      bestRatio = r;
    }
  }
  return best;
}

export interface ArcTokens {
  dark: boolean;
  vars: Record<string, string>;
}

/** Produce every CSS custom property the app consumes. */
export function buildArcTokens(theme: ArcTheme, systemPrefersDark = true): ArcTokens {
  const dark = resolveMode(theme.mode, systemPrefersDark) === "dark";
  const primary = theme.colors[0] ?? DEFAULT_ARC_THEME.colors[0]!;
  const h = primary.hue;
  const s = clamp01(primary.sat);
  const tint = s * (0.006 + theme.intensity * 0.012); // content surfaces stay calm

  const surf = dark
    ? { app: 0.175, sunken: 0.155, card: 0.205, hover: 0.235, elevated: 0.225, sidebar: 0.19 }
    : { app: 0.99, sunken: 0.965, card: 1.0, hover: 0.945, elevated: 1.0, sidebar: 0.975 };

  const bgApp = hex(surf.app, tint, h);
  const bgInput = hex(surf.sunken, tint, h);
  const bgCard = hex(surf.card, tint * 1.1, h);
  const bgCardHover = hex(surf.hover, tint * 1.2, h);
  const bgElevated = hex(surf.elevated, tint * 1.1, h);
  const bgSidebar = hex(surf.sidebar, tint * 1.4, h);

  const textPrimary = solveText(bgApp, dark ? ["#eceef2", "#ffffff"] : ["#1d2026", "#000000"], 7);
  const textSecondary = solveText(bgApp, dark ? [hex(0.74, 0.012, h), hex(0.82, 0.01, h)] : [hex(0.45, 0.015, h), hex(0.35, 0.015, h)], 4.5);
  const textMuted = solveText(bgApp, dark ? [hex(0.58, 0.012, h), hex(0.64, 0.012, h)] : [hex(0.6, 0.012, h), hex(0.52, 0.012, h)], 3);

  const accentChroma = Math.max(0.05, 0.04 + s * 0.15);
  const accentBase = dark ? hex(0.74, accentChroma, h) : hex(0.54, accentChroma, h);
  const accentHover = dark ? hex(0.8, accentChroma, h) : hex(0.48, accentChroma, h);
  const accentContrast = solveText(accentBase, ["#ffffff", "#0b0c10"], 4.5);

  const frameMid = frameAverage(theme, dark);
  const frameText = solveText(frameMid, dark ? ["#f3f4f7", "#ffffff"] : ["#1b1d22", "#000000"], 7);
  const frameMuted = solveText(frameMid, dark ? ["rgba(255,255,255,0.62)", "rgba(255,255,255,0.75)"] : ["rgba(0,0,0,0.55)", "rgba(0,0,0,0.7)"], 3);
  const fg = dark ? "255, 255, 255" : "0, 0, 0";

  const vars: Record<string, string> = {
    "--bg-app": bgApp,
    "--bg-sidebar": bgSidebar,
    "--bg-card": bgCard,
    "--bg-card-hover": bgCardHover,
    "--bg-input": bgInput,
    "--bg-elevated": bgElevated,
    "--border-subtle": `rgba(${fg}, ${dark ? 0.075 : 0.085})`,
    "--border-prominent": `rgba(${fg}, ${dark ? 0.14 : 0.16})`,
    "--text-primary": textPrimary,
    "--text-secondary": textSecondary,
    "--text-muted": textMuted,
    "--accent-base": accentBase,
    "--accent-hover": accentHover,
    "--accent-subtle": `rgba(${rgbTriplet(accentBase)}, ${dark ? 0.16 : 0.12})`,
    "--accent-rgb": rgbTriplet(accentBase),
    "--accent-contrast": accentContrast,
    "--fg-rgb": fg,
    "--frame-gradient": arcFrameGradient(theme, dark),
    "--frame-base": frameMid,
    "--frame-text": frameText,
    "--frame-text-muted": frameMuted,
    "--frame-hover": `rgba(${dark ? "255, 255, 255" : "0, 0, 0"}, ${dark ? 0.09 : 0.06})`,
    "--frame-active": `rgba(${dark ? "255, 255, 255" : "255, 255, 255"}, ${dark ? 0.14 : 0.55})`,
    "--grain-opacity": String(clamp01(theme.grain) * (dark ? 0.22 : 0.16)),
    "--shadow-card": dark
      ? "0 0 0 1px rgba(255,255,255,0.06), 0 8px 30px rgba(0,0,0,0.35)"
      : "0 0 0 1px rgba(0,0,0,0.06), 0 6px 24px rgba(0,0,0,0.08)",
    "--shadow-pop": dark ? "0 16px 48px rgba(0,0,0,0.55)" : "0 16px 40px rgba(0,0,0,0.16)",
    "--scrim": dark ? "rgba(0,0,0,0.55)" : "rgba(30,32,40,0.28)",
    "--color-scheme": dark ? "dark" : "light",
    "--project-color": accentBase,
  };
  return { dark, vars };
}

/** Coerce persisted/untrusted data into a valid theme. */
export function sanitizeArcTheme(value: unknown): ArcTheme {
  const v = (value ?? {}) as Partial<ArcTheme>;
  const colors = Array.isArray(v.colors)
    ? v.colors
        .filter((c): c is ArcColor => !!c && Number.isFinite(c.hue) && Number.isFinite(c.sat))
        .slice(0, MAX_ARC_COLORS)
        .map((c) => ({ hue: wrapHue(c.hue), sat: clamp01(c.sat) }))
    : [];
  return {
    colors: colors.length ? colors : DEFAULT_ARC_THEME.colors,
    mode: v.mode === "light" || v.mode === "dark" || v.mode === "auto" ? v.mode : DEFAULT_ARC_THEME.mode,
    intensity: Number.isFinite(v.intensity) ? clamp01(v.intensity!) : DEFAULT_ARC_THEME.intensity,
    grain: Number.isFinite(v.grain) ? clamp01(v.grain!) : DEFAULT_ARC_THEME.grain,
  };
}

/** Convert any CSS colour to an ArcColor (used by "pick from hex"). */
export function arcColorFromCss(css: string): ArcColor | null {
  const p = parse(css);
  if (!p) return null;
  const o = oklch(p);
  if (!o) return null;
  return { hue: wrapHue(o.h ?? 0), sat: clamp01(((o.c ?? 0) - 0.02) / 0.17) };
}
