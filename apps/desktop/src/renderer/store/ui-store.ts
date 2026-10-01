/**
 * Workbench chrome state: which side panels are open, their sizes, and the settings dialog. Persisted so
 * the window reopens the way it was left.
 */
import { create } from "zustand";
import type { SettingsTabId } from "../components/SettingsModal.tsx";

export type LeftPanel = "projects" | "files" | "git" | "branches";
export type RightPanel = "limits" | "context" | "terminal" | "marketplace";

interface Persisted {
  left: LeftPanel | null;
  right: RightPanel | null;
  leftWidth: number;
  rightWidth: number;
  composerHeight: number;
}

interface UiState extends Persisted {
  settingsOpen: boolean;
  settingsTab: SettingsTabId;
  toggleLeft(p: LeftPanel): void;
  toggleRight(p: RightPanel): void;
  showLeft(p: LeftPanel | null): void;
  showRight(p: RightPanel | null): void;
  setSize(patch: Partial<Pick<Persisted, "leftWidth" | "rightWidth" | "composerHeight">>): void;
  openSettings(tab?: SettingsTabId): void;
  closeSettings(): void;
}

const KEY = "pi-studio.layout.v1";
export const LIMITS = {
  leftWidth: [200, 560] as const,
  rightWidth: [260, 760] as const,
  composerHeight: [96, 480] as const,
};
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, v));

function load(): Persisted {
  const fallback: Persisted = { left: "projects", right: null, leftWidth: 268, rightWidth: 360, composerHeight: 150 };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Persisted> | null;
    if (!raw) return fallback;
    return {
      left: raw.left === undefined ? fallback.left : raw.left,
      right: raw.right === undefined ? fallback.right : raw.right,
      leftWidth: clamp(Number(raw.leftWidth) || fallback.leftWidth, LIMITS.leftWidth),
      rightWidth: clamp(Number(raw.rightWidth) || fallback.rightWidth, LIMITS.rightWidth),
      composerHeight: clamp(Number(raw.composerHeight) || fallback.composerHeight, LIMITS.composerHeight),
    };
  } catch {
    return fallback;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save(s: Persisted) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { left, right, leftWidth, rightWidth, composerHeight } = s;
    localStorage.setItem(KEY, JSON.stringify({ left, right, leftWidth, rightWidth, composerHeight }));
  }, 200);
}

export const useUi = create<UiState>((set, get) => ({
  ...load(),
  settingsOpen: false,
  settingsTab: "appearance",
  toggleLeft: (p) => set({ left: get().left === p ? null : p }),
  toggleRight: (p) => set({ right: get().right === p ? null : p }),
  showLeft: (p) => set({ left: p }),
  showRight: (p) => set({ right: p }),
  setSize: (patch) =>
    set({
      ...(patch.leftWidth !== undefined ? { leftWidth: clamp(patch.leftWidth, LIMITS.leftWidth) } : {}),
      ...(patch.rightWidth !== undefined ? { rightWidth: clamp(patch.rightWidth, LIMITS.rightWidth) } : {}),
      ...(patch.composerHeight !== undefined ? { composerHeight: clamp(patch.composerHeight, LIMITS.composerHeight) } : {}),
    }),
  openSettings: (tab) => set({ settingsOpen: true, ...(tab ? { settingsTab: tab } : {}) }),
  closeSettings: () => set({ settingsOpen: false }),
}));

useUi.subscribe((s) => save(s));

if (typeof window !== "undefined") {
  (window as unknown as { useUi: typeof useUi }).useUi = useUi;
}
