import { describe, expect, it, vi } from "vitest";
import type { ModuleHost, ModuleTab, OpenTabSpec } from "@hive/module-sdk/renderer";
import { DEFAULT_BROWSER_SETTINGS } from "../shared.ts";
import { handleLink, hibernateBackground, openBrowserUrl, runMemoryCheck } from "./browser-actions.ts";

/** Minimal in-memory host mimicking core's tab semantics (reuse + update). */
function fakeHost(initial: ModuleTab[] = [], activeId: string | null = null) {
  const state = { tabs: [...initial], activeId };
  const host = {
    tabs: {
      open(spec: OpenTabSpec) {
        const existing = state.tabs.find((t) => t.kind === spec.kind && spec.reuse?.(t));
        if (existing) { state.activeId = existing.id; return existing.id; }
        const id = spec.id ?? `${spec.kind}-${state.tabs.length + 1}`;
        state.tabs.push({ id, kind: spec.kind, title: spec.title, projectId: "", url: spec.url, isSleeping: false });
        state.activeId = id;
        return id;
      },
      update: (id: string, patch: Partial<ModuleTab>) => {
        state.tabs = state.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t));
      },
      active: () => state.tabs.find((t) => t.id === state.activeId),
      list: () => state.tabs,
    },
    openExternal: vi.fn(async () => {}),
  } as unknown as ModuleHost;
  return { host, state };
}

const tab = (id: string, extra: Partial<ModuleTab> = {}): ModuleTab => ({ id, kind: "browser", title: id, projectId: "", ...extra });

describe("openBrowserUrl", () => {
  it("normalizes input via the search-engine setting and titles by hostname", () => {
    const { host, state } = fakeHost();
    openBrowserUrl(host, { ...DEFAULT_BROWSER_SETTINGS, searchEngine: "google" }, "hello world");
    expect(state.tabs[0]!.url).toBe("https://www.google.com/search?q=hello%20world");
    expect(state.tabs[0]!.title).toBe("www.google.com");
  });

  it("reuses a tab that already has the URL", () => {
    const { host, state } = fakeHost();
    const a = openBrowserUrl(host, DEFAULT_BROWSER_SETTINGS, "https://pi.dev");
    openBrowserUrl(host, DEFAULT_BROWSER_SETTINGS, "https://github.com");
    const again = openBrowserUrl(host, DEFAULT_BROWSER_SETTINGS, "https://pi.dev");
    expect(again).toBe(a);
    expect(state.tabs).toHaveLength(2);
  });
});

describe("handleLink", () => {
  it("opens in Hive by default and in the system browser when opted out", () => {
    const { host, state } = fakeHost();
    handleLink(host, DEFAULT_BROWSER_SETTINGS, "https://pi.dev");
    expect(state.tabs).toHaveLength(1);
    handleLink(host, { ...DEFAULT_BROWSER_SETTINGS, openExternalInHive: false }, "https://other.dev");
    expect(state.tabs).toHaveLength(1);
    expect(host.openExternal).toHaveBeenCalledWith("https://other.dev");
  });
});

describe("runMemoryCheck / hibernateBackground", () => {
  it("wakes a sleeping active tab and sleeps stale background tabs", () => {
    const now = 10 * 60_000;
    const { host, state } = fakeHost(
      [tab("a", { isSleeping: true, lastActiveAt: 0 }), tab("b", { lastActiveAt: 0 })],
      "a",
    );
    runMemoryCheck(host, DEFAULT_BROWSER_SETTINGS, now);
    expect(state.tabs.find((t) => t.id === "a")!.isSleeping).toBe(false);
    expect(state.tabs.find((t) => t.id === "b")!.isSleeping).toBe(true);
  });

  it("hibernateBackground leaves the active and non-browser tabs alone", () => {
    const { host, state } = fakeHost(
      [tab("a"), tab("b"), { id: "p", kind: "plan", title: "p", projectId: "" }],
      "a",
    );
    expect(hibernateBackground(host)).toBe(1);
    expect(state.tabs.find((t) => t.id === "a")!.isSleeping).toBeFalsy();
    expect(state.tabs.find((t) => t.id === "b")!.isSleeping).toBe(true);
    expect(state.tabs.find((t) => t.id === "p")!.isSleeping).toBeFalsy();
  });
});
