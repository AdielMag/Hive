import { lazy } from "react";
import { ShoppingBag } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { MODULE_ID } from "./shared.ts";

const MarketplacePanel = lazy(() =>
  import("./ui/MarketplacePanel.tsx").then((m) => ({ default: m.MarketplacePanel })),
);

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    settings: [
      {
        id: "marketplace",
        label: "Marketplace",
        title: "Marketplace",
        icon: ({ size }) => <ShoppingBag size={size} />,
        component: MarketplacePanel,
      },
    ],
    commands: [
      {
        id: "settings.marketplace",
        title: "Settings: Marketplace",
        category: "App",
        keywords: "show hide marketplace plugins mcp extensions packages",
        run: (host) => host.settings.open("marketplace"),
      },
    ],
  },
});
