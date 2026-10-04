import { lazy } from "react";
import { Blocks, Sparkles } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { LIBRARY_TAB_KIND, MODULE_ID } from "./shared.ts";
import { setLibraryHost } from "./ui/library-host.ts";

const LibraryView = lazy(() => import("./ui/LibraryView.tsx").then((m) => ({ default: m.LibraryView })));

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    tabKinds: [
      {
        kind: LIBRARY_TAB_KIND,
        title: () => "Skills & Agents",
        icon: ({ size }) => <Sparkles size={size} />,
        component: LibraryView,
      },
    ],
    railItems: [
      {
        id: "library",
        title: "Skills & Agents",
        icon: Blocks,
        commandId: "view.library",
        active: (host) => host.tabs.active()?.kind === LIBRARY_TAB_KIND,
        onClick: (host) =>
          host.tabs.open({
            kind: LIBRARY_TAB_KIND,
            title: "Skills & Agents",
            id: "studio:library",
            reuse: (t) => t.kind === LIBRARY_TAB_KIND,
          }),
      },
    ],
    titleMenu: [
      {
        menu: "View",
        label: "Skills & Agents",
        command: "view.library",
      },
    ],
    commands: [
      {
        id: "view.library",
        title: "Open Skills & Agents",
        category: "View",
        keywords: "library subagents skills",
        defaultKeys: ["Mod+Shift+K"],
        allowInTerminal: true,
        run: (host) => {
          host.tabs.open({
            kind: LIBRARY_TAB_KIND,
            title: "Skills & Agents",
            id: "studio:library",
            reuse: (t) => t.kind === LIBRARY_TAB_KIND,
          });
        },
      },
    ],
  },
  activate(host) {
    setLibraryHost(host);
    return () => setLibraryHost(null);
  },
});
