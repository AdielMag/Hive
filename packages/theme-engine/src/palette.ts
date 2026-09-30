import { formatHex, oklch, parse } from "culori";
import { getContrastRatio } from "./contrast.ts";

export interface ArcThemeConfig {
  colors: string[]; // 1 to 3 colors (hex or oklch)
  intensity: number; // 0 to 1
  grain: number; // 0 to 1
  mode: "dark" | "light";
}

export interface GeneratedThemeTokens {
  bgApp: string;
  bgSidebar: string;
  bgCard: string;
  bgCardHover: string;
  bgInput: string;
  bgElevated: string;

  borderSubtle: string;
  borderProminent: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  accentBase: string;
  accentHover: string;
  accentSubtle: string;

  grainOpacity: number;
  gradientBackground: string;
}

export function generateTheme(config: ArcThemeConfig): GeneratedThemeTokens {
  const isDark = config.mode === "dark";
  const primaryColor = config.colors[0] ?? "#539bf5";
  const parsedPrimary = oklch(primaryColor) ?? { mode: "oklch", l: 0.7, c: 0.15, h: 250 };

  const hue = parsedPrimary.h ?? 250;
  const chroma = (parsedPrimary.c ?? 0.1) * config.intensity;

  // Compute background surfaces
  const lApp = isDark ? 0.12 : 0.98;
  const lSidebar = isDark ? 0.14 : 0.95;
  const lCard = isDark ? 0.18 : 1.0;
  const lCardHover = isDark ? 0.22 : 0.92;
  const lInput = isDark ? 0.1 : 0.99;
  const lElevated = isDark ? 0.24 : 0.9;

  const bgApp = formatHex(oklch({ mode: "oklch", l: lApp, c: chroma * 0.25, h: hue }));
  const bgSidebar = formatHex(oklch({ mode: "oklch", l: lSidebar, c: chroma * 0.35, h: hue }));
  const bgCard = formatHex(oklch({ mode: "oklch", l: lCard, c: chroma * 0.3, h: hue }));
  const bgCardHover = formatHex(oklch({ mode: "oklch", l: lCardHover, c: chroma * 0.35, h: hue }));
  const bgInput = formatHex(oklch({ mode: "oklch", l: lInput, c: chroma * 0.2, h: hue }));
  const bgElevated = formatHex(oklch({ mode: "oklch", l: lElevated, c: chroma * 0.4, h: hue }));

  // Compute text colors ensuring WCAG AA contrast (>= 4.5:1)
  let textPrimary = isDark ? "#f0f3f6" : "#1a1d24";
  if (getContrastRatio(textPrimary, bgApp) < 4.5) {
    textPrimary = isDark ? "#ffffff" : "#000000";
  }

  let textSecondary = isDark ? "#9aa4b2" : "#57606a";
  if (getContrastRatio(textSecondary, bgApp) < 3.0) {
    textSecondary = isDark ? "#c9d1d9" : "#32383f";
  }

  const textMuted = isDark ? "#626d7d" : "#8c959f";

  // Accents
  const accentBase = formatHex(parsedPrimary);
  const accentHover = formatHex(
    oklch({
      mode: "oklch",
      l: Math.min(1, (parsedPrimary.l ?? 0.7) + (isDark ? 0.08 : -0.08)),
      c: parsedPrimary.c ?? 0.15,
      h: hue,
    }),
  );
  const accentSubtle = `rgba(${parseInt(accentBase.slice(1, 3), 16)}, ${parseInt(accentBase.slice(3, 5), 16)}, ${parseInt(accentBase.slice(5, 7), 16)}, 0.15)`;

  // Gradient
  let gradientBackground = bgApp;
  if (config.colors.length > 1) {
    const stops = config.colors.map((c) => formatHex(parse(c)!)).join(", ");
    gradientBackground = `linear-gradient(135deg, ${stops})`;
  }

  return {
    bgApp,
    bgSidebar,
    bgCard,
    bgCardHover,
    bgInput,
    bgElevated,
    borderSubtle: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
    borderProminent: isDark ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.16)",
    textPrimary,
    textSecondary,
    textMuted,
    accentBase,
    accentHover,
    accentSubtle,
    grainOpacity: Math.max(0, Math.min(1, config.grain)),
    gradientBackground,
  };
}

export function tokensToCssVars(tokens: GeneratedThemeTokens): Record<string, string> {
  return {
    "--bg-app": tokens.bgApp,
    "--bg-sidebar": tokens.bgSidebar,
    "--bg-card": tokens.bgCard,
    "--bg-card-hover": tokens.bgCardHover,
    "--bg-input": tokens.bgInput,
    "--bg-elevated": tokens.bgElevated,
    "--border-subtle": tokens.borderSubtle,
    "--border-prominent": tokens.borderProminent,
    "--text-primary": tokens.textPrimary,
    "--text-secondary": tokens.textSecondary,
    "--text-muted": tokens.textMuted,
    "--accent-base": tokens.accentBase,
    "--accent-hover": tokens.accentHover,
    "--accent-subtle": tokens.accentSubtle,
  };
}
