import React, { lazy } from "react";
import { Globe } from "lucide-react";
import { defineRendererModule, type ModuleHost } from "@hive/module-sdk/renderer";
import { BROWSER_TAB_KIND, MODULE_ID } from "./shared.ts";
import { setBrowserHost } from "./ui/browser-host.ts";
import { evaluateTabsForMemory, useBrowserStore } from "./ui/browser-store.ts";

const BrowserTab = lazy(() => import("./ui/BrowserTab.tsx").then((m) => ({ default: m.BrowserTab })));
const BrowserSettingsContent = lazy(() =>
  import("./ui/BrowserSettingsContent.tsx").then((m) => ({ default: m.BrowserSettingsContent })),
);

const NewBrowserButton: React.FC<{ host: ModuleHost }> = ({ host }) => (
  <button
    className="tabstrip__new"
    onClick={() => void host.tabs.open({ kind: BROWSER_TAB_KIND, title: "Hive Browser", url: "https://pi.dev" })}
    title="Open Hive Browser Tab (Ctrl+Shift+B)"
  >
    <Globe size={13} />
  </button>
);

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    tabKinds: [
      {
        kind: BROWSER_TAB_KIND,
        title: (t) => t.title,
        icon: ({ size = 13, tab }) =>
          tab.favicon ? (
            <img
              src={tab.favicon}
              alt=""
              className="browser-tab-favicon"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <Globe size={size} />
          ),
        component: BrowserTab,
      },
    ],
    settings: [
      {
        id: "browser",
        label: "Browser & RAM",
        title: "Hive Browser & Memory Management",
        icon: ({ size }) => <Globe size={size} />,
        component: BrowserSettingsContent,
      },
    ],
    commands: [
      {
        id: "browser.new",
        title: "New Browser Tab",
        category: "Browser",
        keywords: "web chromium url link search",
        defaultKeys: ["Mod+Shift+B"],
        allowInTerminal: true,
        run: (host) =>
          void host.tabs.open({
            kind: BROWSER_TAB_KIND,
            title: "Hive Browser",
            url: "https://pi.dev",
          }),
      },
      {
        id: "settings.browser",
        title: "Settings: Browser & RAM",
        category: "App",
        keywords: "browser ram memory saver chromium",
        run: (host) => host.settings.open("browser"),
      },
    ],
    titleMenu: [
      {
        menu: "File",
        label: "New Browser Tab",
        command: "browser.new",
      },
    ],
    slots: {
      "tabstrip.actions": [NewBrowserButton],
    },
  },
  activate(host) {
    setBrowserHost(host);

    // Listen for open browser tab events from main process webviews or external links
    const offOpen = (window as any).studio?.onOpenBrowserTab?.(({ url, title }: { url: string; title?: string }) => {
      host.tabs.open({
        kind: BROWSER_TAB_KIND,
        title: title || "Browser",
        url,
        reuse: (t) => t.url === url,
      });
    });

    // RAM Saver: smart background tab hibernation interval
    const interval = setInterval(() => {
      const tabs = host.tabs.list();
      const active = host.tabs.active();
      const settings = useBrowserStore.getState().settings;
      const { tabsToSleep, tabsToWake } = evaluateTabsForMemory(tabs, active?.id ?? null, settings);
      for (const id of tabsToSleep) host.tabs.update(id, { isSleeping: true });
      for (const id of tabsToWake) host.tabs.update(id, { isSleeping: false, lastActiveAt: Date.now() });
    }, 15000);

    return () => {
      if (offOpen) offOpen();
      clearInterval(interval);
      setBrowserHost(null);
    };
  },
});
