import { lazy } from "react";
import { ShoppingBag } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { MARKETPLACE_PANEL_ID, MODULE_ID } from "./shared.ts";

const MarketplacePanel = lazy(() =>
  import("./ui/MarketplacePanel.tsx").then((m) => ({ default: m.MarketplacePanel })),
);

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    rightPanels: [
      {
        id: MARKETPLACE_PANEL_ID,
        title: "Marketplace",
        icon: ({ size }) => <ShoppingBag size={size} />,
        commandId: "view.marketplace",
        component: MarketplacePanel,
      },
    ],
    commands: [
      {
        id: "view.marketplace",
        title: "Toggle Marketplace Panel",
        category: "View",
        keywords: "show hide marketplace plugins mcp extensions packages",
        run: (host) => host.panels.toggle("right", MARKETPLACE_PANEL_ID),
      },
    ],
  },
});
