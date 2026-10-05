import type { ITheme } from "@xterm/xterm";

export const TERMINAL_FONT = `"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Mono", Consolas, monospace`;

let probe: CanvasRenderingContext2D | null = null;

/** Resolve any CSS color (var(), color-mix(), rgba…) to [r,g,b,a] by letting the browser paint it. */
function resolveColor(value: string): [number, number, number, number] | null {
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe || !value) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  // Premultiplied alpha round-trip is lossy; good enough for UI chrome.
  return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");
const toHex = (c: [number, number, number, number]) => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`;

function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** Blend `fg` over `bg` at `alpha`. */
function mix(fg: [number, number, number, number], bg: [number, number, number, number], alpha: number): string {
  return toHex([
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
    1,
  ]);
}

const luminance = (c: [number, number, number, number]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

const DARK_ANSI = {
  black: "#3b4252",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#d4d4d8",
  brightBlack: "#71717a",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#fafafa",
};

const LIGHT_ANSI = {
  black: "#1f2328",
  red: "#c62828",
  green: "#1a7f37",
  yellow: "#946800",
  blue: "#0969da",
  magenta: "#8250df",
  cyan: "#0e7490",
  white: "#6e7781",
  brightBlack: "#57606a",
  brightRed: "#d32f2f",
  brightGreen: "#2da44e",
  brightYellow: "#b58900",
  brightBlue: "#218bff",
  brightMagenta: "#a475f9",
  brightCyan: "#1b9bb5",
  brightWhite: "#8c959f",
};

export interface ResolvedTerminalTheme {
  theme: ITheme;
  background: string;
  searchDecorations: {
    matchBackground: string;
    matchBorder: string;
    matchOverviewRuler: string;
    activeMatchBackground: string;
    activeMatchBorder: string;
    activeMatchColorOverviewRuler: string;
  };
}

/** Build the xterm theme from Hive's live CSS variables (re-run when the app theme changes). */
export function resolveTerminalTheme(root: Element = document.documentElement): ResolvedTerminalTheme {
  const bg = resolveColor(cssVar(root, "--bg-app")) ?? [19, 16, 13, 1];
  const fg = resolveColor(cssVar(root, "--text-primary")) ?? [236, 238, 242, 1];
  const accent = resolveColor(cssVar(root, "--accent-base")) ?? [108, 149, 235, 1];
  const isLight = luminance(bg) > 0.55;
  const ansi = isLight ? LIGHT_ANSI : DARK_ANSI;
  const background = toHex(bg);
  const accentHex = toHex(accent);

  return {
    background,
    theme: {
      ...ansi,
      background,
      foreground: toHex(fg),
      cursor: accentHex,
      cursorAccent: background,
      selectionBackground: mix(accent, bg, isLight ? 0.28 : 0.38),
      selectionInactiveBackground: mix(fg, bg, 0.18),
    },
    searchDecorations: {
      matchBackground: mix(accent, bg, 0.35),
      matchBorder: mix(accent, bg, 0.6),
      matchOverviewRuler: accentHex,
      activeMatchBackground: mix(accent, bg, 0.7),
      activeMatchBorder: accentHex,
      activeMatchColorOverviewRuler: accentHex,
    },
  };
}
