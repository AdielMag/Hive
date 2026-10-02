import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore } from "./session-store.ts";

describe("Browser tabs in session store", () => {
  beforeEach(() => {
    (globalThis as any).window = {
      studio: {
        rpc: async () => ({ ok: true }),
        openSystemBrowser: async () => {},
      },
    };

    useSessionStore.setState({
      tabs: [],
      activeTabId: null,
      activeProject: {
        id: "proj-1",
        name: "Test Project",
        path: "/test",
        color: "#fff",
        pinned: false,
        hidden: false,
        links: [],
        defaults: {},
        createdAt: "",
        updatedAt: "",
      },
    });
  });

  it("opens a new browser tab with normalized URL and switches to it", () => {
    const store = useSessionStore.getState();
    store.openBrowserTab("https://pi.dev/docs", "Pi Docs");

    const state = useSessionStore.getState();
    expect(state.tabs.length).toBe(1);
    const tab = state.tabs[0]!;
    expect(tab.kind).toBe("browser");
    expect(tab.url).toBe("https://pi.dev/docs");
    expect(tab.title).toBe("Pi Docs");
    expect(tab.isSleeping).toBe(false);
    expect(state.activeTabId).toBe(tab.id);
  });

  it("reuses existing browser tab if same URL is opened again", () => {
    const store = useSessionStore.getState();
    store.openBrowserTab("https://pi.dev", "Pi");
    const firstTabId = useSessionStore.getState().activeTabId;

    // Open a second tab with different URL
    store.openBrowserTab("https://github.com", "GitHub");
    expect(useSessionStore.getState().tabs.length).toBe(2);

    // Open first URL again -> switches to firstTabId without creating a 3rd tab
    store.openBrowserTab("https://pi.dev");
    expect(useSessionStore.getState().tabs.length).toBe(2);
    expect(useSessionStore.getState().activeTabId).toBe(firstTabId);
  });

  it("allows putting a browser tab to sleep and waking it up", () => {
    const store = useSessionStore.getState();
    store.openBrowserTab("https://pi.dev", "Pi");
    const tabId = useSessionStore.getState().activeTabId!;

    store.setTabSleeping(tabId, true);
    expect(useSessionStore.getState().tabs[0]!.isSleeping).toBe(true);

    store.setTabSleeping(tabId, false);
    expect(useSessionStore.getState().tabs[0]!.isSleeping).toBe(false);
  });

  it("sleepAllBackgroundTabs only hibernates background browser tabs", () => {
    const store = useSessionStore.getState();
    store.openBrowserTab("https://tab1.com", "Tab 1");
    store.openBrowserTab("https://tab2.com", "Tab 2");
    // Tab 2 is active, Tab 1 is in background

    store.sleepAllBackgroundTabs();

    const tabs = useSessionStore.getState().tabs;
    const tab1 = tabs.find((t) => t.url === "https://tab1.com");
    const tab2 = tabs.find((t) => t.url === "https://tab2.com");

    expect(tab1?.isSleeping).toBe(true);
    expect(tab2?.isSleeping).toBe(false); // active tab stays live
  });

  it("switching to a sleeping browser tab automatically wakes it", async () => {
    const store = useSessionStore.getState();
    store.openBrowserTab("https://tab1.com", "Tab 1");
    const tab1Id = useSessionStore.getState().activeTabId!;

    store.openBrowserTab("https://tab2.com", "Tab 2");

    // Put tab 1 to sleep in background
    store.setTabSleeping(tab1Id, true);
    expect(useSessionStore.getState().tabs.find((t) => t.id === tab1Id)?.isSleeping).toBe(true);

    // Switch to tab 1
    await store.switchTab(tab1Id);

    expect(useSessionStore.getState().activeTabId).toBe(tab1Id);
    expect(useSessionStore.getState().tabs.find((t) => t.id === tab1Id)?.isSleeping).toBe(false);
  });
});
