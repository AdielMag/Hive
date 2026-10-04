import { PieChart } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { CONTEXT_PANEL_ID, MODULE_ID } from "./shared.ts";

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    rightPanels: [
      {
        id: CONTEXT_PANEL_ID,
        title: "Context Window",
        icon: ({ size }) => <PieChart size={size} />,
        commandId: "view.context",
        component: ({ host }) => <host.ui.ContextBreakdownPanel host={host} />,
      },
    ],
    commands: [
      {
        id: "view.context",
        title: "Toggle Context Window Panel",
        category: "View",
        keywords: "context tokens memory window breakdown",
        run: (host) => host.panels.toggle("right", CONTEXT_PANEL_ID),
      },
    ],
    titleMenu: [{ menu: "View", label: "Context Window", command: "view.context" }],
  },
});
