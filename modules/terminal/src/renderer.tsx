import { lazy } from "react";
import { Terminal as TerminalIcon } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { MODULE_ID, TERMINAL_PANEL_ID } from "./shared.ts";
import { runInTerminal } from "./ui/run-in-terminal.ts";

// xterm (~430 kB) is only fetched the first time the panel opens.
const TerminalPanel = lazy(() => import("./ui/TerminalPanel.tsx").then((m) => ({ default: m.TerminalPanel })));

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    rightPanels: [
      {
        id: TERMINAL_PANEL_ID,
        title: "Terminal",
        icon: ({ size }) => <TerminalIcon size={size} />,
        commandId: "view.terminal",
        component: TerminalPanel,
      },
    ],
    commands: [
      {
        id: "view.terminal",
        title: "Toggle Terminal Panel",
        category: "View",
        keywords: "shell console powershell bash",
        defaultKeys: ["Mod+`"],
        allowInTerminal: true,
        run: (host) => host.panels.toggle("right", TERMINAL_PANEL_ID),
      },
      {
        // Programmatic entry point (the Files panel's "Run" button calls it by id). `when: false` keeps it out of the palette.
        id: "terminal.run",
        title: "Run Command in Terminal",
        category: "Terminal",
        keywords: "execute shell command",
        when: () => false,
        run: (host, args) => runInTerminal(host, args),
      },
    ],
    titleMenu: [{ menu: "View", label: "Terminal", command: "view.terminal" }],
  },
});
