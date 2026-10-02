import { describe, expect, it } from "vitest";
import {
  DEFAULT_BROWSER_SETTINGS,
  evaluateTabsForMemory,
  formatUrlOrSearch,
  type BrowserSettings,
} from "./browser-store.ts";
import type { TabItem } from "@hive/protocol";

describe("formatUrlOrSearch", () => {
  it("verifies default settings constants", () => {
    expect(DEFAULT_BROWSER_SETTINGS.autoSleepMinutes).toBe(5);
    expect(DEFAULT_BROWSER_SETTINGS.maxLiveTabs).toBe(2);
    expect(DEFAULT_BROWSER_SETTINGS.autoWakeOnSelect).toBe(true);
    expect(DEFAULT_BROWSER_SETTINGS.openExternalInHive).toBe(true);
  });

  it("defaults to https://pi.dev on empty input", () => {
    expect(formatUrlOrSearch("")).toBe("https://pi.dev");
    expect(formatUrlOrSearch("   ")).toBe("https://pi.dev");
  });

  it("preserves explicit http/https protocols", () => {
    expect(formatUrlOrSearch("https://github.com/foo/bar")).toBe("https://github.com/foo/bar");
    expect(formatUrlOrSearch("http://example.com")).toBe("http://example.com");
  });

  it("formats localhost and 127.0.0.1 correctly", () => {
    expect(formatUrlOrSearch("localhost")).toBe("http://localhost");
    expect(formatUrlOrSearch("localhost:3000")).toBe("http://localhost:3000");
    expect(formatUrlOrSearch("localhost:5173/app")).toBe("http://localhost:5173/app");
    expect(formatUrlOrSearch("127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
  });

  it("prepends https:// to standard domain names", () => {
    expect(formatUrlOrSearch("vite.dev")).toBe("https://vite.dev");
    expect(formatUrlOrSearch("github.com/trending")).toBe("https://github.com/trending");
    expect(formatUrlOrSearch("sub.domain.co.uk/path?q=1")).toBe("https://sub.domain.co.uk/path?q=1");
  });

  it("converts search queries to engine URLs", () => {
    expect(formatUrlOrSearch("react 19 new features", "duckduckgo")).toBe(
      "https://duckduckgo.com/?q=react%2019%20new%20features",
    );
    expect(formatUrlOrSearch("how to use hive", "google")).toBe(
      "https://www.google.com/search?q=how%20to%20use%20hive",
    );
    expect(formatUrlOrSearch("pi coding agent", "bing")).toBe(
      "https://www.bing.com/search?q=pi%20coding%20agent",
    );
  });
});

describe("evaluateTabsForMemory", () => {
  const settings: BrowserSettings = {
    autoSleepMinutes: 5,
    maxLiveTabs: 2,
    autoWakeOnSelect: true,
    openExternalInHive: true,
    searchEngine: "duckduckgo",
  };

  const now = 10000000;

  it("wakes up sleeping active tab when autoWakeOnSelect is enabled", () => {
    const tabs: TabItem[] = [
      {
        id: "tab1",
        kind: "browser",
        projectId: "p1",
        title: "Docs",
        pinned: false,
        url: "https://pi.dev",
        isSleeping: true,
      },
    ];

    const result = evaluateTabsForMemory(tabs, "tab1", settings, now);
    expect(result.tabsToWake).toEqual(["tab1"]);
    expect(result.tabsToSleep).toEqual([]);
  });

  it("sleeps inactive background tabs exceeding autoSleepMinutes", () => {
    const sixMinutesAgo = now - 6 * 60 * 1000;
    const twoMinutesAgo = now - 2 * 60 * 1000;

    const tabs: TabItem[] = [
      {
        id: "activeTab",
        kind: "browser",
        projectId: "p1",
        title: "Active",
        pinned: false,
        url: "https://active.com",
        isSleeping: false,
        lastActiveAt: now,
      },
      {
        id: "oldTab",
        kind: "browser",
        projectId: "p1",
        title: "Old",
        pinned: false,
        url: "https://old.com",
        isSleeping: false,
        lastActiveAt: sixMinutesAgo,
      },
      {
        id: "recentTab",
        kind: "browser",
        projectId: "p1",
        title: "Recent",
        pinned: false,
        url: "https://recent.com",
        isSleeping: false,
        lastActiveAt: twoMinutesAgo,
      },
    ];

    const result = evaluateTabsForMemory(tabs, "activeTab", settings, now);
    expect(result.tabsToSleep).toContain("oldTab");
    expect(result.tabsToSleep).not.toContain("recentTab");
    expect(result.tabsToSleep).not.toContain("activeTab");
  });

  it("enforces LRU maxLiveTabs budget on background tabs", () => {
    // maxLiveTabs = 2, but we have 4 recent background tabs
    const tabs: TabItem[] = [
      {
        id: "active",
        kind: "browser",
        projectId: "p1",
        title: "Active",
        pinned: false,
        url: "https://active.com",
        isSleeping: false,
        lastActiveAt: now,
      },
      {
        id: "bg1",
        kind: "browser",
        projectId: "p1",
        title: "Bg 1",
        pinned: false,
        url: "https://1.com",
        isSleeping: false,
        lastActiveAt: now - 10000, // oldest of the 4
      },
      {
        id: "bg2",
        kind: "browser",
        projectId: "p1",
        title: "Bg 2",
        pinned: false,
        url: "https://2.com",
        isSleeping: false,
        lastActiveAt: now - 8000, // 2nd oldest
      },
      {
        id: "bg3",
        kind: "browser",
        projectId: "p1",
        title: "Bg 3",
        pinned: false,
        url: "https://3.com",
        isSleeping: false,
        lastActiveAt: now - 5000, // newer
      },
      {
        id: "bg4",
        kind: "browser",
        projectId: "p1",
        title: "Bg 4",
        pinned: false,
        url: "https://4.com",
        isSleeping: false,
        lastActiveAt: now - 2000, // newest
      },
    ];

    const result = evaluateTabsForMemory(tabs, "active", settings, now);
    // Budget is 2 background live tabs. We have 4. Excess = 2 oldest (bg1, bg2).
    expect(result.tabsToSleep).toEqual(["bg1", "bg2"]);
  });

  it("never sleeps active tab even if idle for long", () => {
    const tabs: TabItem[] = [
      {
        id: "activeLongIdle",
        kind: "browser",
        projectId: "p1",
        title: "Idle Active",
        pinned: false,
        url: "https://active.com",
        isSleeping: false,
        lastActiveAt: now - 60 * 60 * 1000, // 1 hour ago
      },
    ];

    const result = evaluateTabsForMemory(tabs, "activeLongIdle", settings, now);
    expect(result.tabsToSleep).toEqual([]);
  });

  it("ignores non-browser tabs during memory evaluation", () => {
    const tabs: TabItem[] = [
      {
        id: "sessionTab",
        kind: "session",
        projectId: "p1",
        title: "Session 1",
        pinned: false,
      },
      {
        id: "fileTab",
        kind: "file",
        projectId: "p1",
        title: "index.ts",
        pinned: false,
      },
    ];

    const result = evaluateTabsForMemory(tabs, "sessionTab", settings, now);
    expect(result.tabsToSleep).toEqual([]);
    expect(result.tabsToWake).toEqual([]);
  });
});
