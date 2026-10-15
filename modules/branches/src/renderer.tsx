import { lazy } from "react";
import { GitBranch } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { BRANCHES_PANEL_ID, MODULE_ID } from "./shared.ts";
import { setBranchesHost } from "./ui/branches-host.ts";

const BranchesPanel = lazy(() => import("./ui/BranchesPanel.tsx").then((m) => ({ default: m.BranchesPanel })));

export default defineRendererModule({
  id: MODULE_ID,
  activate(host) {
    setBranchesHost(host);
    return () => setBranchesHost(null);
  },
  contributes: {
    bottomPanels: [
      {
        id: BRANCHES_PANEL_ID,
        title: "Git Branches & Log",
        order: 30,
        icon: ({ size }) => <GitBranch size={size} />,
        commandId: "view.branches",
        component: BranchesPanel,
      },
    ],
    commands: [
      {
        id: "view.branches",
        title: "Toggle Branches Window",
        category: "View",
        keywords: "git history graph checkout",
        allowInTerminal: true,
        run: (host) => host.panels.toggle("bottom", BRANCHES_PANEL_ID),
      },
    ],
  },
});
