/**
 * Browser settings, omnibox URL formatting, and Smart RAM Management for Hive Chromium tabs.
 */
import { create } from "zustand";
import type { TabItem } from "@hive/protocol";
import { getStoredItem, setStoredItem } from "../storage.ts";

export type SearchEngine = "duckduckgo" | "google" | "bing";

export interface BrowserSettings {
  autoSleepMinutes: number; // default: 5 (0 means never)
  maxLiveTabs: number; // default: 2 (0 means unlimited)
  autoWakeOnSelect: boolean; // default: true
  openExternalInHive: boolean; // default: true
  searchEngine: SearchEngine; // default: "duckduckgo"
}

export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
  autoSleepMinutes: 5,
  maxLiveTabs: 2,
  autoWakeOnSelect: true,
  openExternalInHive: true,
  searchEngine: "duckduckgo",
};

const KEY = "hive.browser.settings.v1";

function loadSettings(): BrowserSettings {
  try {
    const raw = JSON.parse(getStoredItem(KEY) ?? "null");
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

export function saveSettings(settings: BrowserSettings): void {
  try {
    setStoredItem(KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

/**
 * Normalizes input from the omnibox address bar into a navigable URL.
 * Handles protocols, localhost/IPs, domains, and web search queries.
 */
export function formatUrlOrSearch(input: string, engine: SearchEngine = "duckduckgo"): string {
  const trimmed = input.trim();
  if (!trimmed) return "https://pi.dev";

  // Explicit valid protocols
  if (/^(https?|file|chrome|edge):\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Localhost or 127.0.0.1 with optional port
  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed) || /^127\.0\.0\.1(:\d+)?(\/.*)?$/.test(trimmed)) {
    return `http://${trimmed}`;
  }

  // IPv4 address
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/.test(trimmed)) {
    return `http://${trimmed}`;
  }

  // Standard domain name (e.g. google.com, vite.dev, sub.domain.co.uk/path) without spaces
  if (!/\s/.test(trimmed) && /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  // Fallback: Web search query
  const query = encodeURIComponent(trimmed);
  switch (engine) {
    case "google":
      return `https://www.google.com/search?q=${query}`;
    case "bing":
      return `https://www.bing.com/search?q=${query}`;
    case "duckduckgo":
    default:
      return `https://duckduckgo.com/?q=${query}`;
  }
}

/**
 * Pure evaluation function for smart memory tab management.
 * Identifies which browser tabs should sleep or wake based on LRU limits and inactivity timeout.
 */
export function evaluateTabsForMemory(
  tabs: TabItem[],
  activeTabId: string | null,
  settings: BrowserSettings,
  now: number = Date.now(),
): { tabsToSleep: string[]; tabsToWake: string[] } {
  const tabsToSleep: string[] = [];
  const tabsToWake: string[] = [];

  const browserTabs = tabs.filter((t) => t.kind === "browser");
  const activeTab = browserTabs.find((t) => t.id === activeTabId);

  // 1. Wake active tab if sleeping and autoWakeOnSelect is enabled
  if (activeTab && activeTab.isSleeping && settings.autoWakeOnSelect) {
    tabsToWake.push(activeTab.id);
  }

  // 2. Identify background browser tabs
  const backgroundTabs = browserTabs.filter((t) => t.id !== activeTabId);

  // 3. Inactivity sleeping: if tab has been inactive longer than autoSleepMinutes
  const timeoutMs = settings.autoSleepMinutes * 60 * 1000;
  for (const tab of backgroundTabs) {
    if (!tab.isSleeping && settings.autoSleepMinutes > 0) {
      const lastActive = tab.lastActiveAt ?? now;
      if (now - lastActive >= timeoutMs) {
        tabsToSleep.push(tab.id);
      }
    }
  }

  // 4. LRU budget cap: limit number of concurrent live background tabs
  if (settings.maxLiveTabs > 0) {
    const liveBackgroundTabs = backgroundTabs.filter((t) => !t.isSleeping && !tabsToSleep.includes(t.id));
    if (liveBackgroundTabs.length > settings.maxLiveTabs) {
      // Sort oldest active first
      liveBackgroundTabs.sort((a, b) => (a.lastActiveAt ?? 0) - (b.lastActiveAt ?? 0));
      const excessCount = liveBackgroundTabs.length - settings.maxLiveTabs;
      for (let i = 0; i < excessCount; i++) {
        tabsToSleep.push(liveBackgroundTabs[i]!.id);
      }
    }
  }

  return { tabsToSleep, tabsToWake };
}

interface BrowserStoreState {
  settings: BrowserSettings;
  updateSettings(patch: Partial<BrowserSettings>): void;
}

export const useBrowserStore = create<BrowserStoreState>((set, get) => ({
  settings: loadSettings(),
  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    saveSettings(next);
    set({ settings: next });
  },
}));
