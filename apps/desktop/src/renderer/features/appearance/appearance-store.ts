/**
 * Appearance preferences (Arc theme + editor typography). Persisted in localStorage and applied to the
 * document root as CSS custom properties. `applyAppearance` runs before React mounts so there is no flash
 * of the default theme on launch.
 */
import { create } from "zustand";
import { buildArcTokens, sanitizeArcTheme, type ArcTheme, DEFAULT_ARC_THEME } from "@pi-studio/theme-engine";

export interface EditorPrefs {
  /** Code font size in px (code blocks, file viewer, diff, terminal). */
  codeFontSize: number;
  ligatures: boolean;
  /** Wrap long lines in transcript code blocks. */
  wrapCode: boolean;
}

export interface AppearanceState {
  theme: ArcTheme;
  editor: EditorPrefs;
  setTheme(patch: Partial<ArcTheme>): void;
  replaceTheme(theme: ArcTheme): void;
  setEditor(patch: Partial<EditorPrefs>): void;
  reset(): void;
}

const STORAGE_KEY = "pi-studio.appearance.v2";
const DEFAULT_EDITOR: EditorPrefs = { codeFontSize: 12.5, ligatures: true, wrapCode: false };

function load(): { theme: ArcTheme; editor: EditorPrefs } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { theme?: unknown; editor?: Partial<EditorPrefs> };
      const fontSize = Number(data.editor?.codeFontSize);
      return {
        theme: sanitizeArcTheme(data.theme),
        editor: {
          codeFontSize: Number.isFinite(fontSize) ? Math.max(10, Math.min(18, fontSize)) : DEFAULT_EDITOR.codeFontSize,
          ligatures: data.editor?.ligatures ?? DEFAULT_EDITOR.ligatures,
          wrapCode: data.editor?.wrapCode ?? DEFAULT_EDITOR.wrapCode,
        },
      };
    }
  } catch {
    // fall through to defaults
  }
  return { theme: DEFAULT_ARC_THEME, editor: DEFAULT_EDITOR };
}

const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;

let raf = 0;
export function applyAppearance(theme: ArcTheme, editor: EditorPrefs): void {
  // Coalesce rapid updates (pad dragging) into one style write per frame.
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => applyNow(theme, editor));
}

function applyNow(theme: ArcTheme, editor: EditorPrefs): void {
  const root = document.documentElement;
  const { dark, vars } = buildArcTokens(theme, systemDark());
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.setProperty("--code-font-size", `${editor.codeFontSize}px`);
  root.style.setProperty("--code-ligatures", editor.ligatures ? "normal" : "none");
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.theme = dark ? "dark" : "light";
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist(theme: ArcTheme, editor: EditorPrefs): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, editor })), 150);
}

const initial = load();

export const useAppearance = create<AppearanceState>((set, get) => {
  const commit = (theme: ArcTheme, editor: EditorPrefs) => {
    set({ theme, editor });
    applyAppearance(theme, editor);
    persist(theme, editor);
  };
  return {
    ...initial,
    setTheme: (patch) => commit(sanitizeArcTheme({ ...get().theme, ...patch }), get().editor),
    replaceTheme: (theme) => commit(sanitizeArcTheme(theme), get().editor),
    setEditor: (patch) => commit(get().theme, { ...get().editor, ...patch }),
    reset: () => commit(DEFAULT_ARC_THEME, DEFAULT_EDITOR),
  };
});

/** Apply persisted appearance synchronously at startup and follow OS light/dark changes for "auto". */
export function initAppearance(): void {
  const { theme, editor } = useAppearance.getState();
  applyNow(theme, editor);
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const s = useAppearance.getState();
    if (s.theme.mode === "auto") applyNow(s.theme, s.editor);
  });
}
