import { lazy } from "react";
import { Files } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { FILES_PANEL_ID, MODULE_ID } from "./shared.ts";

const FilesPanel = lazy(() => import("./ui/FilesPanel.tsx").then((m) => ({ default: m.FilesPanel })));

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    leftPanels: [
      {
        id: FILES_PANEL_ID,
        title: "Files",
        order: 10,
        icon: ({ size }) => <Files size={size} />,
        commandId: "view.files",
        component: FilesPanel,
      },
    ],
    commands: [
      {
        id: "view.files",
        title: "Toggle Files Panel",
        category: "View",
        keywords: "explorer tree browse",
        defaultKeys: ["Mod+Shift+E"],
        allowInTerminal: true,
        run: (host) => host.panels.toggle("left", FILES_PANEL_ID),
      },
    ],
    titleMenu: [{ menu: "View", label: "Files", command: "view.files" }],
  },
});
