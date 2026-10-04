import React, { lazy } from "react";
import { Globe } from "lucide-react";
import { defineRendererModule, type ModuleHost } from "@hive/module-sdk/renderer";
import { BROWSER_TAB_KIND, MODULE_ID } from "./shared.ts";
import { setBrowserHost } from "./ui/browser-host.ts";
import { useBrowserStore } from "./ui/browser-store.ts";
import { handleLink, openBrowserUrl, runMemoryCheck } from "./ui/browser-actions.ts";

const BrowserTab = lazy(() => import("./ui/BrowserTab.tsx").then((m) => ({ default: m.BrowserTab })));
const BrowserSettingsContent = lazy(() =>
  import("./ui/BrowserSettingsContent.tsx").then((m) => ({ default: m.BrowserSettingsContent })),
);

const NewBrowserButton: React.FC<{ host: ModuleHost }> = ({ host }) => (
  <button
    className="tabstrip__new"
    onClick={() => openBrowserUrl(host, useBrowserStore.getState().settings, "https://pi.dev", "Hive Browser")}
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
        run: (host) => void openBrowserUrl(host, useBrowserStore.getState().settings, "https://pi.dev", "Hive Browser"),
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

    // Claim clicked links (Markdown, webview popups, Help menu) while this module is enabled.
    const offLinks = host.links.setHandler((url, title) => handleLink(host, useBrowserStore.getState().settings, url, title));

    // RAM Saver: wake/sleep on every tab change (instant) and on a slow timer (inactivity timeout).
    const check = () => runMemoryCheck(host, useBrowserStore.getState().settings);
    const offTabs = host.tabs.onChange(check);
    const interval = setInterval(check, 15000);
    check();

    return () => {
      offLinks();
      offTabs();
      clearInterval(interval);
      setBrowserHost(null);
    };
  },
});
