/**
 * Browser settings store for Hive Chromium tabs.
 */
import { create } from "zustand";
import {
  DEFAULT_BROWSER_SETTINGS,
  type BrowserSettings,
  type SearchEngine,
} from "../shared.ts";

export type { BrowserSettings, SearchEngine };
export { DEFAULT_BROWSER_SETTINGS, evaluateTabsForMemory, formatUrlOrSearch } from "../shared.ts";

const KEY = "hive.browser.settings.v1";

function getStored(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function setStored(key: string, val: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, val);
  } catch {}
}

function loadSettings(): BrowserSettings {
  try {
    const raw = JSON.parse(getStored(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return DEFAULT_BROWSER_SETTINGS;
    return {
      autoSleepMinutes: typeof raw.autoSleepMinutes === "number" ? raw.autoSleepMinutes : DEFAULT_BROWSER_SETTINGS.autoSleepMinutes,
      maxLiveTabs: typeof raw.maxLiveTabs === "number" ? raw.maxLiveTabs : DEFAULT_BROWSER_SETTINGS.maxLiveTabs,
      autoWakeOnSelect: typeof raw.autoWakeOnSelect === "boolean" ? raw.autoWakeOnSelect : DEFAULT_BROWSER_SETTINGS.autoWakeOnSelect,
      openExternalInHive: typeof raw.openExternalInHive === "boolean" ? raw.openExternalInHive : DEFAULT_BROWSER_SETTINGS.openExternalInHive,
      searchEngine: ["duckduckgo", "google", "bing"].includes(raw.searchEngine) ? raw.searchEngine : DEFAULT_BROWSER_SETTINGS.searchEngine,
    };
  } catch {
    return DEFAULT_BROWSER_SETTINGS;
  }
}

export interface BrowserStoreState {
  settings: BrowserSettings;
  updateSettings: (patch: Partial<BrowserSettings>) => void;
  resetSettings: () => void;
}

export const useBrowserStore = create<BrowserStoreState>((set, get) => ({
  settings: loadSettings(),
  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    setStored(KEY, JSON.stringify(next));
  },
  resetSettings: () => {
    set({ settings: DEFAULT_BROWSER_SETTINGS });
    setStored(KEY, JSON.stringify(DEFAULT_BROWSER_SETTINGS));
  },
}));
