import { lazy } from "react";
import { BarChart3 } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { MODULE_ID, USAGE_TAB_ID, USAGE_TAB_KIND } from "./shared.ts";
import { setAnalyticsHost } from "./ui/analytics-host.ts";
import { useInsights } from "./ui/insights-store.ts";
import "./ui/insights.css";

const UsageView = lazy(() => import("./ui/UsageView.tsx").then((m) => ({ default: m.UsageView })));

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    tabKinds: [
      {
        kind: USAGE_TAB_KIND,
        title: () => "Usage & Analytics",
        icon: ({ size }) => <BarChart3 size={size} />,
        component: () => <UsageView />,
      },
    ],
    commands: [
      {
        id: "view.usage",
        title: "Open Usage Analytics",
        category: "View",
        keywords: "cost tokens quota analytics spend",
        defaultKeys: ["Mod+Shift+U"],
        allowInTerminal: true,
        run: (host, args) => {
          const focusSession = (args as { focusSession?: string } | undefined)?.focusSession ?? null;
          useInsights.getState().setFocusSession(focusSession);
          host.tabs.open({
            id: USAGE_TAB_ID,
            kind: USAGE_TAB_KIND,
            title: "Usage",
            reuse: (t) => t.id === USAGE_TAB_ID || t.kind === USAGE_TAB_KIND,
          });
        },
      },
    ],
    railItems: [
      {
        id: "analytics",
        title: "Usage & Cost Analytics",
        icon: ({ size }) => <BarChart3 size={size} />,
        commandId: "view.usage",
        active: (host) => host.tabs.active()?.kind === USAGE_TAB_KIND,
        onClick: (host) => void host.commands.run("view.usage"),
      },
    ],
    statusBar: [
      {
        id: "analytics-btn",
        component: ({ host }) => (
          <button
            className="statusbar__btn"
            onClick={() => void host.commands.run("view.usage")}
            title="Usage analytics (all sessions)"
          >
            <BarChart3 size={12} />
          </button>
        ),
      },
    ],
    titleMenu: [{ menu: "View", label: "Usage Analytics", command: "view.usage" }],
  },
  activate(host) {
    setAnalyticsHost(host);
    void useInsights.getState().refreshUsage();
    return () => {
      setAnalyticsHost(null);
    };
  },
});
