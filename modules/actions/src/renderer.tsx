import { lazy } from "react";
import { Play } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { ACTIONS_PANEL_ID, MODULE_ID } from "./shared.ts";
import { setActionsHost } from "./ui/actions-host.ts";
import { startActionsPolling } from "./ui/actions-store.ts";
import { ActionsBadge, useActionsRailTitle } from "./ui/ActionsBadge.tsx";
import "./ui/actions.css";

const ActionsPanel = lazy(() => import("./ui/ActionsPanel.tsx").then((m) => ({ default: m.ActionsPanel })));

export default defineRendererModule({
  id: MODULE_ID,
  activate(host) {
    setActionsHost(host);
    const stop = startActionsPolling(host);
    return () => {
      stop();
      setActionsHost(null);
    };
  },
  contributes: {
    leftPanels: [
      {
        id: ACTIONS_PANEL_ID,
        title: "GitHub Actions",
        order: 40,
        icon: ({ size }) => <Play size={size} />,
        commandId: "view.actions",
        badge: ActionsBadge,
        useTitle: useActionsRailTitle,
        component: ActionsPanel,
      },
    ],
    commands: [
      {
        id: "view.actions",
        title: "Toggle GitHub Actions Panel",
        category: "View",
        keywords: "github actions workflow ci runs builds pipeline",
        allowInTerminal: true,
        run: (host) => host.panels.toggle("left", ACTIONS_PANEL_ID),
      },
    ],
    titleMenu: [{ menu: "View", label: "GitHub Actions", command: "view.actions" }],
  },
});
