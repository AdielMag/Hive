/**
 * Workbench chrome state: which side panels are open, their sizes, and the settings dialog. Persisted so
 * the window reopens the way it was left.
 */
import { create } from "zustand";
import type { SettingsTabId } from "../components/SettingsModal.tsx";
import { getStoredItem, setStoredItem } from "../lib/storage.ts";
import { staticPanelIds } from "../modules/manifests.ts";
import {
  clamp,
  LIMITS,
  sanitizeLayout,
  type LeftPanel,
  type RightPanel,
  type PersistedLayout as Persisted,
} from "./layout-persist.ts";

export type { LeftPanel, RightPanel };
export { LIMITS };

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

const KEY = "hive.layout.v1";

function load(): Persisted {
  const fallback: Persisted = { left: "projects", right: null, leftWidth: 268, rightWidth: 360, composerHeight: 150 };
  try {
    const raw = JSON.parse(getStoredItem(KEY) ?? "null") as Partial<Persisted> | null;
    return sanitizeLayout(raw, fallback, staticPanelIds());
  } catch {
    return fallback;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save(s: Persisted) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { left, right, leftWidth, rightWidth, composerHeight } = s;
    setStoredItem(KEY, JSON.stringify({ left, right, leftWidth, rightWidth, composerHeight }));
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
