import { lazy } from "react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { ACTIONS_PANEL_ID, MODULE_ID } from "./shared.ts";
import { setActionsHost } from "./ui/actions-host.ts";
import { startActionsPolling } from "./ui/actions-store.ts";
import { ActionsBadge, useActionsRailTitle } from "./ui/ActionsBadge.tsx";
import "./ui/actions.css";

// Octicons "play-16": the glyph GitHub uses for its Actions tab.
function GitHubActionsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z" />
    </svg>
  );
}

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
        icon: ({ size }) => <GitHubActionsIcon size={size} />,
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
