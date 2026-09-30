import React, { useMemo } from "react";
import { Layout, Model, type TabNode, type IJsonModel } from "flexlayout-react";
import "flexlayout-react/style/dark.css";
import { Folder, GitBranch, Files, Terminal as TerminalIcon, PieChart, ShoppingBag } from "lucide-react";
import { Transcript } from "./Transcript.tsx";
import { Composer } from "./Composer.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { GitPanel } from "./GitPanel.tsx";
import { FilesPanel } from "./FilesPanel.tsx";
import { MarketplacePanel } from "./MarketplacePanel.tsx";
import { WelcomeView } from "./WelcomeView.tsx";
import { useSessionStore } from "../store/session-store.ts";

const DEFAULT_LAYOUT: IJsonModel = {
  global: {
    tabEnableClose: false,
    tabSetEnableClose: false,
    tabSetEnableDrop: true,
    borderBarSize: 42,
    borderEnableAutoHide: false,
  },
  borders: [
    {
      type: "border",
      location: "left",
      size: 260,
      children: [
        {
          type: "tab",
          id: "projects",
          name: "Projects",
          component: "projects",
        },
        {
          type: "tab",
          id: "files",
          name: "Files",
          component: "files",
        },
        {
          type: "tab",
          id: "git",
          name: "Git",
          component: "git",
        },
      ],
    },
    {
      type: "border",
      location: "right",
      size: 300,
      children: [
        {
          type: "tab",
          id: "marketplace",
          name: "Marketplace",
          component: "marketplace",
        },
        {
          type: "tab",
          id: "context",
          name: "Context",
          component: "context",
        },
        {
          type: "tab",
          id: "terminal",
          name: "Terminal",
          component: "terminal",
        },
      ],
    },
  ],
  layout: {
    type: "row",
    weight: 100,
    children: [
      {
        type: "tabset",
        weight: 100,
        enableTabStrip: false,
        children: [
          {
            type: "tab",
            id: "chat",
            name: "Session",
            component: "chat",
          },
        ],
      },
    ],
  },
};

export const DockShell: React.FC = () => {
  const model = useMemo(() => Model.fromJson(DEFAULT_LAYOUT), []);
  const { activeProject, tabs } = useSessionStore();

  const factory = (node: TabNode) => {
    const component = node.getComponent();
    switch (component) {
      case "chat":
        if (!activeProject || tabs.length === 0) {
          return <WelcomeView />;
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
            <Transcript />
            <Composer />
          </div>
        );

      case "projects":
        return <Sidebar />;

      case "files":
        return <FilesPanel />;

      case "git":
        return <GitPanel />;

      case "marketplace":
        return <MarketplacePanel />;

      case "context":
        return (
          <div style={{ padding: 14, color: "var(--text-muted)", fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>Context Breakdown</div>
            <div>Detailed token category inspector is also available by clicking the Context Ring below.</div>
          </div>
        );

      case "terminal":
        return (
          <div style={{ padding: 14, color: "var(--text-muted)", fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>Integrated Terminal</div>
            <div>Run files with the interpreter runner in the Files tab or launch terminal tasks.</div>
          </div>
        );

      default:
        return <div>{component}</div>;
    }
  };

  // Renders ONLY the icon when on the border bars! No text!
  const titleFactory = (node: TabNode) => {
    const id = node.getId();
    const isBorder = node.getParent()?.getType() === "border";

    let icon: React.ReactNode = null;
    if (id === "projects") icon = <Folder size={18} />;
    else if (id === "files") icon = <Files size={18} />;
    else if (id === "git") icon = <GitBranch size={18} />;
    else if (id === "marketplace") icon = <ShoppingBag size={18} />;
    else if (id === "context") icon = <PieChart size={18} />;
    else if (id === "terminal") icon = <TerminalIcon size={18} />;

    if (isBorder) {
      // ONLY THE ICON! Tooltip shows the name on hover.
      return (
        <span
          title={node.getName()}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
          }}
        >
          {icon}
        </span>
      );
    }

    // Inside a tabset: show icon + name
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {icon}
        <span>{node.getName()}</span>
      </span>
    );
  };

  return (
    <div style={{ flex: 1, position: "relative" }}>
      <Layout model={model} factory={factory} titleFactory={titleFactory} />
    </div>
  );
};
