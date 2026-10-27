/**
 * Workbench chrome state: which side panels are open, their sizes, and the settings dialog. Persisted so
 * the window reopens the way it was left.
 */
import { create } from "zustand";
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

export type CoreSettingsTabId = "appearance" | "sound" | "models" | "compaction" | "accounts" | "keyboard" | "modules" | "updates" | "about";
/** Core tab, or `<moduleId>:<tabId>` for a settings page contributed by a module. */
export type SettingsTabId = CoreSettingsTabId | (string & {});

export type { LeftPanel, RightPanel };
export { LIMITS };

/** Set when Settings is opened because a provider's login failed: highlights that account in AI Providers. */
export interface SettingsFocus {
  providerId: string;
  /** Why we're here, shown as a notice on the account card. */
  reason?: string;
}

interface UiState extends Persisted {
  settingsOpen: boolean;
  settingsTab: SettingsTabId;
  settingsFocus: SettingsFocus | null;
  projectTabsEnabled: boolean;
  setProjectTabsEnabled(enabled: boolean): void;
  toggleLeft(p: LeftPanel): void;
  toggleRight(p: RightPanel): void;
  toggleBottom(p: string): void;
  showLeft(p: LeftPanel | null): void;
  showRight(p: RightPanel | null): void;
  showBottom(p: string | null): void;
  setSize(patch: Partial<Pick<Persisted, "leftWidth" | "rightWidth" | "composerHeight" | "bottomHeight">>): void;
  shortcutsOpen: boolean;
  toggleShortcuts(): void;
  closeShortcuts(): void;
  openSettings(tab?: SettingsTabId, focus?: SettingsFocus): void;
  /** Opens Settings → AI Providers on a provider that needs (re)connecting. */
  openAccountSettings(providerId: string, reason?: string): void;
  closeSettings(): void;
}

const KEY = "hive.layout.v1";
const PROJECT_TABS_ENABLED_KEY = "hive.project-tabs-enabled.v1";

function loadProjectTabsEnabled(): boolean {
  try {
    const raw = getStoredItem(PROJECT_TABS_ENABLED_KEY);
    return raw !== null ? raw === "true" : true;
  } catch {
    return true;
  }
}

function load(): Persisted {
  const fallback: Persisted = { left: "projects", right: null, bottom: null, leftWidth: 268, rightWidth: 360, composerHeight: 150, bottomHeight: 380 };
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
    const { left, right, bottom, leftWidth, rightWidth, composerHeight, bottomHeight } = s;
    setStoredItem(KEY, JSON.stringify({ left, right, bottom, leftWidth, rightWidth, composerHeight, bottomHeight }));
  }, 200);
}

export const useUi = create<UiState>((set, get) => ({
  ...load(),
  settingsOpen: false,
  shortcutsOpen: false,
  settingsTab: "appearance",
  settingsFocus: null,
  projectTabsEnabled: typeof window !== "undefined" ? loadProjectTabsEnabled() : true,
  setProjectTabsEnabled: (enabled) => {
    set({ projectTabsEnabled: enabled });
    try {
      setStoredItem(PROJECT_TABS_ENABLED_KEY, String(enabled));
    } catch {}
  },
  toggleShortcuts: () => set((s) => ({ shortcutsOpen: !s.shortcutsOpen })),
  closeShortcuts: () => set({ shortcutsOpen: false }),
  toggleLeft: (p) => set({ left: get().left === p ? null : p }),
  toggleRight: (p) => set({ right: get().right === p ? null : p }),
  showLeft: (p) => set({ left: p }),
  toggleBottom: (p) => set({ bottom: get().bottom === p ? null : p }),
  showRight: (p) => set({ right: p }),
  showBottom: (p) => set({ bottom: p }),
  setSize: (patch) =>
    set({
      ...(patch.leftWidth !== undefined ? { leftWidth: clamp(patch.leftWidth, LIMITS.leftWidth) } : {}),
      ...(patch.rightWidth !== undefined ? { rightWidth: clamp(patch.rightWidth, LIMITS.rightWidth) } : {}),
      ...(patch.bottomHeight !== undefined ? { bottomHeight: clamp(patch.bottomHeight, LIMITS.bottomHeight) } : {}),
      ...(patch.composerHeight !== undefined ? { composerHeight: clamp(patch.composerHeight, LIMITS.composerHeight) } : {}),
    }),
  openSettings: (tab, focus) => set({ settingsOpen: true, settingsFocus: focus ?? null, ...(tab ? { settingsTab: tab } : {}) }),
  openAccountSettings: (providerId, reason) =>
    set({ settingsOpen: true, settingsTab: "accounts", settingsFocus: { providerId, ...(reason ? { reason } : {}) } }),
  closeSettings: () => set({ settingsOpen: false, settingsFocus: null }),
}));

useUi.subscribe((s) => save(s));

if (typeof window !== "undefined") {
  (window as unknown as { useUi: typeof useUi }).useUi = useUi;
}
