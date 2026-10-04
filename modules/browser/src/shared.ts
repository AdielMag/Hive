/**
 * Contract and pure helpers for the browser module.
 */

export const MODULE_ID = "browser";
export const BROWSER_TAB_KIND = "browser";

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

/**
 * Normalizes input from the omnibox address bar into a navigable URL.
 * Handles protocols, localhost/IPs, domains, and web search queries.
 */
export function formatUrlOrSearch(input: string, engine: SearchEngine = "duckduckgo"): string {
  const trimmed = input.trim();
  if (!trimmed) return "https://pi.dev";

  if (/^(https?|file|chrome|edge):\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed) || /^127\.0\.0\.1(:\d+)?(\/.*)?$/.test(trimmed)) {
    return `http://${trimmed}`;
  }

  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/.test(trimmed)) {
    return `http://${trimmed}`;
  }

  if (!/\s/.test(trimmed) && /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

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
  tabs: Array<{ id: string; kind?: string; isSleeping?: boolean; lastActiveAt?: number }>,
  activeTabId: string | null,
  settings: BrowserSettings,
  now: number = Date.now(),
): { tabsToSleep: string[]; tabsToWake: string[] } {
  const tabsToSleep: string[] = [];
  const tabsToWake: string[] = [];

  const browserTabs = tabs.filter((t) => t.kind === BROWSER_TAB_KIND);
  const activeTab = browserTabs.find((t) => t.id === activeTabId);

  if (activeTab && activeTab.isSleeping && settings.autoWakeOnSelect) {
    tabsToWake.push(activeTab.id);
  }

  const backgroundTabs = browserTabs.filter((t) => t.id !== activeTabId);
  const timeoutMs = settings.autoSleepMinutes * 60 * 1000;
  for (const tab of backgroundTabs) {
    if (!tab.isSleeping && settings.autoSleepMinutes > 0) {
      const lastActive = tab.lastActiveAt ?? now;
      if (now - lastActive >= timeoutMs) {
        tabsToSleep.push(tab.id);
      }
    }
  }

  if (settings.maxLiveTabs > 0) {
    const liveBackgroundTabs = backgroundTabs.filter((t) => !t.isSleeping && !tabsToSleep.includes(t.id));
    if (liveBackgroundTabs.length > settings.maxLiveTabs) {
      liveBackgroundTabs.sort((a, b) => (a.lastActiveAt ?? 0) - (b.lastActiveAt ?? 0));
      const excessCount = liveBackgroundTabs.length - settings.maxLiveTabs;
      for (let i = 0; i < excessCount; i++) {
        tabsToSleep.push(liveBackgroundTabs[i]!.id);
      }
    }
  }

  return { tabsToSleep, tabsToWake };
}
