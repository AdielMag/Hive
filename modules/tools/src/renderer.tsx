import { lazy } from "react";
import { Wrench } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { MODULE_ID, TOOLS_PANEL_ID } from "./shared.ts";

const ToolsPanel = lazy(() => import("./ui/ToolsPanel.tsx").then((m) => ({ default: m.ToolsPanel })));

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    rightPanels: [
      {
        id: TOOLS_PANEL_ID,
        title: "Tools",
        icon: ({ size }) => <Wrench size={size} />,
        commandId: "view.tools",
        component: ToolsPanel,
      },
    ],
    commands: [
      {
        id: "view.tools",
        title: "Toggle Tools Panel",
        category: "View",
        keywords: "mcp skills subagents inspect tools",
        run: (host) => host.panels.toggle("right", TOOLS_PANEL_ID),
      },
    ],
    titleMenu: [{ menu: "View", label: "Tools Breakdown", command: "view.tools" }],
  },
});
