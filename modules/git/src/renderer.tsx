import { lazy } from "react";
import { GitCommit } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { DIFF_ACTIONS_SLOT } from "@hive-module/diff-viewer/shared";
import { GIT_PANEL_ID, GitCommands, MODULE_ID } from "./shared.ts";
import { setGitHost } from "./ui/git-host.ts";
import { startGitStatusWatcher, useGitStore } from "./ui/git-store.ts";
import { GitBadge, useGitRailTitle } from "./ui/GitBadge.tsx";
import { StageButton } from "./ui/StageButton.tsx";
import { openDiffTab } from "./ui/open-diff.ts";
import "./ui/git.css";

const GitPanel = lazy(() => import("./ui/GitPanel.tsx").then((m) => ({ default: m.GitPanel })));

export default defineRendererModule({
  id: MODULE_ID,
  activate(host) {
    setGitHost(host);
    const stop = startGitStatusWatcher(host);
    return () => {
      stop();
      setGitHost(null);
    };
  },
  contributes: {
    leftPanels: [
      {
        id: GIT_PANEL_ID,
        title: "Commits & Staging",
        order: 20,
        icon: ({ size }) => <GitCommit size={size} />,
        commandId: "view.git",
        badge: GitBadge,
        useTitle: useGitRailTitle,
        component: GitPanel,
      },
    ],
    commands: [
      {
        id: "view.git",
        title: "Toggle Git Panel",
        category: "View",
        keywords: "source control commit stage diff",
        defaultKeys: ["Mod+Shift+G"],
        allowInTerminal: true,
        run: (host) => host.panels.toggle("left", GIT_PANEL_ID),
      },
      {
        // Programmatic entry point for modules that depend on git state (branches refreshes the rail badge through it).
        id: GitCommands.refresh,
        title: "Refresh Git Status",
        category: "Git",
        when: () => false,
        run: () => useGitStore.getState().refreshGit(),
      },
      {
        id: GitCommands.openDiff,
        title: "Open Git Diff",
        category: "Git",
        when: () => false,
        run: (host, args) => {
          const { filePath, staged, projectId } = (args ?? {}) as { filePath?: string; staged?: boolean; projectId?: string };
          const project = host.sessions.activeProject();
          if (!filePath || !project || (projectId && projectId !== project.id)) return;
          return openDiffTab(host, project, filePath, Boolean(staged));
        },
      },
    ],
    titleMenu: [{ menu: "View", label: "Source Control", command: "view.git" }],
    slots: {
      [DIFF_ACTIONS_SLOT]: [StageButton],
    },
    aiFeatures: [
      {
        id: "gitCommit",
        label: "Git commit messages",
        description: "Model used to write commit messages from staged changes.",
      },
    ],
  },
});
